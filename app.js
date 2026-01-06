const { createApp, ref, computed, watch, onMounted } = Vue;

// 类型映射
const typeMap = { '花': 'spend', '厉': 'li', '衡': 'heng' };
const typeNames = { spend: '花', li: '厉', heng: '衡' };
const categoryMap = {
    '随盒赠钱': 'suihe',
    '待铸子钱': 'daizhu',
    '富贵商钱': 'fugui',
    '砺武兵钱': 'liwu',
    '天师奇钱': 'tianshi'
};
const categoryFolderMap = {
    'suihe': '随盒赠钱',
    'daizhu': '待铸子钱',
    'fugui': '富贵商钱',
    'liwu': '砺武兵钱',
    'tianshi': '天师奇钱'
};

// 解析CSV
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const coins = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const coin = {};
        headers.forEach((h, idx) => coin[h] = (values[idx] || '').trim());
        
        // 转换为应用需要的格式
        const category = categoryMap[coin['分类']] || 'suihe';
        const folder = coin['分类'] || '随盒赠钱';
        coins.push({
            id: coin['文件'],
            name: coin['名称'],
            type: typeMap[coin['类型']] || 'heng',
            effect: coin['效果'],
            description: coin['描述'],
            source: coin['获取方式'],
            remark: coin['备注'],
            category: category,
            image: encodeURI(`界园通宝/${folder}/${coin['文件']}.png`),
            benefit: coin['收益类型'] === '1' ? parseInt(coin['价值']) || 0 : 0,
            benefitUnit: coin['收益类型'] === '1' ? '生命上限' : ''
        });
    }
    return coins;
}


createApp({
    setup() {
        const mode = ref('judge');
        const loading = ref(true);
        
        // 通宝分类
        const categories = [
            { id: 'suihe', name: '随盒赠钱' },
            { id: 'daizhu', name: '待铸子钱' },
            { id: 'fugui', name: '富贵商钱' },
            { id: 'liwu', name: '砺武兵钱' },
            { id: 'tianshi', name: '天师奇钱' }
        ];
        const selectedCategory = ref('suihe');
        
        // 所有通宝数据（从CSV加载）
        const allCoins = ref([]);
        
        // 钱盒配置
        const coinBoxCapacity = ref(10); // 钱盒容量
        const drawCount = ref(3); // 每次投钱数量，默认3
        const coinBox = ref([]);
        const selectedSlot = ref(null);
        
        // 撤销/还原历史
        const coinBoxHistory = ref([]);
        const coinBoxFuture = ref([]);
        const maxHistoryLength = 50;
        
        // 保存钱盒状态到历史
        function saveCoinBoxState() {
            coinBoxHistory.value.push(JSON.stringify(coinBox.value));
            if (coinBoxHistory.value.length > maxHistoryLength) {
                coinBoxHistory.value.shift();
            }
            coinBoxFuture.value = []; // 清空还原栈
        }
        
        // 撤销
        function undoCoinBox() {
            if (coinBoxHistory.value.length === 0) return;
            coinBoxFuture.value.push(JSON.stringify(coinBox.value));
            const prevState = coinBoxHistory.value.pop();
            coinBox.value = JSON.parse(prevState);
        }
        
        // 还原
        function redoCoinBox() {
            if (coinBoxFuture.value.length === 0) return;
            coinBoxHistory.value.push(JSON.stringify(coinBox.value));
            const nextState = coinBoxFuture.value.pop();
            coinBox.value = JSON.parse(nextState);
        }
        
        // 通宝预览
        const previewCoin = ref(null);
        
        // 加载CSV数据
        async function loadCoinsData() {
            try {
                const response = await fetch(encodeURI('通宝数据.csv'));
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const csvText = await response.text();
                console.log('CSV loaded, lines:', csvText.split('\n').length);
                allCoins.value = parseCSV(csvText);
                console.log('Parsed coins:', allCoins.value.length);
                // 初始化钱盒为随盒赠钱
                const initCoins = allCoins.value.filter(c => c.category === 'suihe');
                coinBox.value = initCoins.slice(0, coinBoxCapacity.value);
                loading.value = false;
            } catch (error) {
                console.error('加载通宝数据失败:', error);
                loading.value = false;
            }
        }
        
        // 获取大炎通宝对象
        function getDayanCoin() {
            return allCoins.value.find(c => c.name === '大炎通宝') || null;
        }
        
        // 监听钱盒容量变化，调整钱盒大小
        watch(coinBoxCapacity, (newCapacity, oldCapacity) => {
            if (newCapacity > oldCapacity) {
                // 扩容：填充大炎通宝
                const dayanCoin = getDayanCoin();
                saveCoinBoxState();
                while (coinBox.value.length < newCapacity) {
                    coinBox.value.push(dayanCoin ? { ...dayanCoin } : null);
                }
            } else if (newCapacity < oldCapacity) {
                // 缩容：截断
                saveCoinBoxState();
                coinBox.value = coinBox.value.slice(0, newCapacity);
            }
            // 确保投钱数不超过容量
            if (drawCount.value > newCapacity) {
                drawCount.value = newCapacity;
            }
        });
        
        onMounted(() => {
            loadCoinsData();
        });
        
        // 筛选通宝
        const filteredCoins = computed(() => {
            return allCoins.value.filter(c => c.category === selectedCategory.value);
        });
        
        // 可计算期望的通宝
        const expectableCoins = computed(() => {
            return coinBox.value.filter(c => c && c.benefit);
        });
        
        // 统计钱盒中各类型数量
        const spendCount = computed(() => coinBox.value.filter(c => c && c.type === 'spend').length);
        const liCount = computed(() => coinBox.value.filter(c => c && c.type === 'li').length);
        const hengCount = computed(() => coinBox.value.filter(c => c && c.type === 'heng').length);
        const totalCoins = computed(() => coinBox.value.filter(c => c).length);
        
        // 计算钱盒行布局（类似3-4-3的菱形布局）
        const coinBoxRows = computed(() => {
            const total = coinBox.value.length;
            const rows = [];
            let idx = 0;
            
            if (total <= 3) {
                // 1-3个：单行
                rows.push({ startIdx: 0, coins: coinBox.value.slice(0, total) });
            } else if (total <= 7) {
                // 4-7个：2-3-2 或 3-4 布局
                const firstRow = Math.ceil(total / 2) - 1;
                const secondRow = total - firstRow * 2 > 0 ? Math.min(total - firstRow, firstRow + 1) : firstRow;
                rows.push({ startIdx: 0, coins: coinBox.value.slice(0, firstRow) });
                rows.push({ startIdx: firstRow, coins: coinBox.value.slice(firstRow, firstRow + secondRow) });
                if (firstRow + secondRow < total) {
                    rows.push({ startIdx: firstRow + secondRow, coins: coinBox.value.slice(firstRow + secondRow) });
                }
            } else {
                // 8+个：3-4-3... 或动态计算
                let remaining = total;
                let rowNum = 0;
                while (remaining > 0) {
                    let rowSize;
                    if (rowNum === 0) {
                        rowSize = Math.min(3, remaining);
                    } else if (remaining <= 3) {
                        rowSize = remaining;
                    } else if (remaining <= 7) {
                        rowSize = 4;
                    } else {
                        rowSize = (rowNum % 2 === 1) ? 4 : 3;
                    }
                    rows.push({ startIdx: idx, coins: coinBox.value.slice(idx, idx + rowSize) });
                    idx += rowSize;
                    remaining -= rowSize;
                    rowNum++;
                }
            }
            return rows;
        });
        
        // 选择槽位
        function selectSlot(idx) {
            selectedSlot.value = selectedSlot.value === idx ? null : idx;
        }
        
        // 检查通宝是否可以添加到钱盒（重复限制）
        function canAddCoin(coin, targetSlotIndex) {
            // 随盒赠钱和圣诏封神可以重复
            if (coin.category === 'suihe' || coin.id === 'rogue_5_copper_S_4') {
                return true;
            }
            
            // 检查钱盒中是否已存在相同通宝（排除目标槽位）
            for (let i = 0; i < coinBox.value.length; i++) {
                if (i === targetSlotIndex) continue;
                const existingCoin = coinBox.value[i];
                if (existingCoin && existingCoin.id === coin.id) {
                    return false;
                }
            }
            return true;
        }
        
        // 预选的通宝（用于先选通宝再选槽位的操作方式）
        const pendingCoin = ref(null);
        
        // 点击通宝库中的通宝
        function handleCoinClick(coin) {
            // 方式1：先选槽位再选通宝
            if (selectedSlot.value !== null) {
                if (!canAddCoin(coin, selectedSlot.value)) {
                    alert(`钱盒内已有【${coin.name}】，无法添加重复通宝`);
                    return;
                }
                saveCoinBoxState();
                coinBox.value[selectedSlot.value] = { ...coin };
                selectedSlot.value = null;
                pendingCoin.value = null;
                previewCoin.value = coin;
                return;
            }
            
            // 方式2：先选通宝，等待选槽位
            if (pendingCoin.value && pendingCoin.value.id === coin.id) {
                // 再次点击取消预选
                pendingCoin.value = null;
            } else {
                pendingCoin.value = coin;
            }
            previewCoin.value = coin;
        }
        
        // 替换通宝
        function replaceCoin(coin) {
            if (selectedSlot.value !== null) {
                if (!canAddCoin(coin, selectedSlot.value)) {
                    alert(`钱盒内已有【${coin.name}】，无法添加重复通宝`);
                    return;
                }
                saveCoinBoxState();
                coinBox.value[selectedSlot.value] = { ...coin };
                selectedSlot.value = null;
            }
        }

        // 判定模式
        const coinType = ref('spend');
        const condition = ref('atleast');
        const targetCount = ref(1);
        const currentResult = ref(null);
        const history = ref([]);
        
        // 指定组合
        const comboSpend = ref(1);
        const comboLi = ref(1);
        const comboHeng = ref(1);
        
        const coinTypes = { spend: '花钱', li: '厉钱', heng: '衡钱' };

        // 组合数
        function combination(n, k) {
            if (k > n || k < 0) return 0;
            if (k === 0 || k === n) return 1;
            let result = 1;
            for (let i = 1; i <= k; i++) result *= (n - k + i) / i;
            return result;
        }
        
        // 计算概率
        function calculateProbability() {
            const total = totalCoins.value;
            const draw = drawCount.value;
            if (total < draw) return;
            
            let probability = 0;
            let description = '';
            
            if (condition.value === 'combo') {
                // 指定组合模式
                const s = comboSpend.value;
                const l = comboLi.value;
                const h = comboHeng.value;
                
                if (s + l + h !== draw) {
                    alert(`组合总数必须为${draw}`);
                    return;
                }
                
                if (s > spendCount.value || l > liCount.value || h > hengCount.value) {
                    probability = 0;
                } else {
                    probability = combination(spendCount.value, s) * 
                                 combination(liCount.value, l) * 
                                 combination(hengCount.value, h) / 
                                 combination(total, draw);
                }
                
                const parts = [];
                if (s > 0) parts.push(`花${s}`);
                if (l > 0) parts.push(`厉${l}`);
                if (h > 0) parts.push(`衡${h}`);
                description = `投出${parts.join('+')}`;
            } else {
                let targetCoinCount;
                switch (coinType.value) {
                    case 'spend': targetCoinCount = spendCount.value; break;
                    case 'li': targetCoinCount = liCount.value; break;
                    case 'heng': targetCoinCount = hengCount.value; break;
                }
                
                if (condition.value === 'exact') {
                    if (targetCount.value <= targetCoinCount && targetCount.value <= draw) {
                        probability = combination(targetCoinCount, targetCount.value) * 
                                     combination(total - targetCoinCount, draw - targetCount.value) / 
                                     combination(total, draw);
                    }
                    description = `${coinTypes[coinType.value]}恰好${targetCount.value}个`;
                } else {
                    for (let i = targetCount.value; i <= Math.min(draw, targetCoinCount); i++) {
                        probability += combination(targetCoinCount, i) * 
                                      combination(total - targetCoinCount, draw - i) / 
                                      combination(total, draw);
                    }
                    description = `${coinTypes[coinType.value]}至少${targetCount.value}个`;
                }
            }
            
            const result = {
                description,
                probability,
                spendCount: spendCount.value,
                liCount: liCount.value,
                hengCount: hengCount.value
            };
            currentResult.value = result;
            history.value.unshift(result);
            if (history.value.length > 3) history.value.pop();
        }

        // 期望模式
        const expectCategory = ref('coin');
        const expectTarget = ref('');
        const throwCount = ref(10);
        const expectResult = ref(null);
        const expectHistory = ref([]);
        
        // 茧成绢专用参数
        const baseYuanshiding = ref(20);
        const jcjMode = ref('byThrow');
        const jcjThrowCount = ref(10);
        const jcjTargetYuan = ref(100);
        
        // 支持计算的通宝配置
        const calculableCoinConfigs = {
            'rogue_5_copper_U_8': { expectDesc: '投出时目标生命值上限+2' },
            'rogue_5_copper_R_08': { expectDesc: '每有4点源石锭获得1点（单次最多99）' }
        };
        
        // 可计算的通宝列表（从所有通宝中筛选）
        const calculableCoins = computed(() => {
            return allCoins.value.filter(c => calculableCoinConfigs[c.id]).map(c => ({
                ...c,
                expectDesc: calculableCoinConfigs[c.id].expectDesc
            }));
        });
        
        // 计算投出花钱的概率（修性情是花钱）
        function getSpendProb() {
            const total = totalCoins.value;
            if (total < 3 || spendCount.value === 0) return 0;
            const probZero = combination(total - spendCount.value, 3) / combination(total, 3);
            return 1 - probZero;
        }
        
        // 修性情计算：投出时目标生命值上限+2
        function calculateXiuXingQing() {
            const total = totalCoins.value;
            if (total < 3) return;
            
            const prob = getSpendProb();
            const expectedHP = throwCount.value * prob * 2;
            
            const result = {
                coinName: '修性情',
                expectedValue: expectedHP.toFixed(2),
                benefitUnit: '生命上限',
                detail: `投钱${throwCount.value}次 | 投出花钱概率: ${(prob * 100).toFixed(2)}% | 每次+2生命上限`
            };
            expectResult.value = result;
            expectHistory.value.unshift(result);
            if (expectHistory.value.length > 5) expectHistory.value.pop();
        }
        
        // 茧成绢计算：每有4点源石锭获得1点源石锭（单次最多99）
        function calculateJianChengJuan() {
            const total = totalCoins.value;
            if (total < 3) return;
            
            const prob = getSpendProb(); // 茧成绢是花钱
            
            if (jcjMode.value === 'byThrow') {
                // 模式1：指定投掷次数，计算期望源石锭
                // 复利计算：每次投出后，基础+收益作为下次计算基础
                let yuan = baseYuanshiding.value;
                
                for (let i = 0; i < jcjThrowCount.value; i++) {
                    const gain = Math.min(Math.floor(yuan / 4), 99);
                    yuan += prob * gain; // 期望收益累加到基础上
                }
                
                const result = {
                    coinName: '茧成绢',
                    expectedValue: '合计 ' + yuan.toFixed(2),
                    benefitUnit: '源石锭',
                    detail: `初始${baseYuanshiding.value} | 投掷${jcjThrowCount.value}次 | 投出花钱概率${(prob * 100).toFixed(1)}%`
                };
                expectResult.value = result;
                expectHistory.value.unshift(result);
            } else {
                // 模式2：指定目标源石锭，计算期望投掷次数
                let yuan = baseYuanshiding.value;
                let throws = 0;
                const maxThrows = 1000;
                
                if (yuan < 4) {
                    const result = {
                        coinName: '茧成绢',
                        expectedValue: '无法计算',
                        benefitUnit: '',
                        detail: '初始源石锭不足4，无法触发收益'
                    };
                    expectResult.value = result;
                    expectHistory.value.unshift(result);
                    if (expectHistory.value.length > 5) expectHistory.value.pop();
                    return;
                }
                
                while (yuan < jcjTargetYuan.value && throws < maxThrows) {
                    const gain = Math.min(Math.floor(yuan / 4), 99);
                    if (gain === 0) break;
                    yuan += prob * gain;
                    throws++;
                }
                
                const result = {
                    coinName: '茧成绢',
                    expectedValue: throws >= maxThrows ? '1000+' : throws.toFixed(0),
                    benefitUnit: '次投掷',
                    detail: `从${baseYuanshiding.value}到${jcjTargetYuan.value}源石锭 | 投出花钱概率${(prob * 100).toFixed(1)}%`
                };
                expectResult.value = result;
                expectHistory.value.unshift(result);
            }
            
            if (expectHistory.value.length > 5) expectHistory.value.pop();
        }
        
        // 藏品计算相关
        const expectRelicTarget = ref('');
        const relicThrowCount = ref(10);
        
        // 支持计算的藏品配置
        const calculableRelicConfigs = {
            'rogue_5_relic_speg_2': { name: '异食兽像', effect: '投出3枚厉钱时，获得3点生命上限+3点护盾' },
            'rogue_5_relic_speg_3': { name: '吉运有三', effect: '投出3枚花钱时，获得8源石锭+1希望' }
        };
        
        // 可计算的藏品列表
        const calculableRelics = computed(() => {
            return Object.keys(calculableRelicConfigs).map(id => ({
                id,
                name: calculableRelicConfigs[id].name,
                effect: calculableRelicConfigs[id].effect,
                image: `界园藏品/${id}.png`
            }));
        });
        
        // 计算至少投出3枚厉钱的概率
        function getAtLeast3LiProb() {
            const total = totalCoins.value;
            const draw = drawCount.value;
            if (total < draw || liCount.value < 3) return 0;
            
            let prob = 0;
            // 从3枚到最多draw枚厉钱
            for (let i = 3; i <= Math.min(draw, liCount.value); i++) {
                prob += combination(liCount.value, i) * combination(total - liCount.value, draw - i) / combination(total, draw);
            }
            return prob;
        }
        
        // 计算至少投出3枚花钱的概率
        function getAtLeast3SpendProb() {
            const total = totalCoins.value;
            const draw = drawCount.value;
            if (total < draw || spendCount.value < 3) return 0;
            
            let prob = 0;
            // 从3枚到最多draw枚花钱
            for (let i = 3; i <= Math.min(draw, spendCount.value); i++) {
                prob += combination(spendCount.value, i) * combination(total - spendCount.value, draw - i) / combination(total, draw);
            }
            return prob;
        }
        
        // 异食兽像计算：至少投出3枚厉钱时，获得3点生命上限+3点护盾
        function calculateYishishou() {
            const total = totalCoins.value;
            const draw = drawCount.value;
            if (total < draw) return;
            
            const prob = getAtLeast3LiProb();
            const expectedHP = relicThrowCount.value * prob * 3;
            const expectedShield = relicThrowCount.value * prob * 3;
            
            const result = {
                coinName: '异食兽像',
                expectedValue: `${expectedHP.toFixed(2)}生命上限 + ${expectedShield.toFixed(2)}护盾`,
                benefitUnit: '',
                detail: `投钱${relicThrowCount.value}次 | 至少3厉概率: ${(prob * 100).toFixed(2)}%`
            };
            expectResult.value = result;
            expectHistory.value.unshift(result);
            if (expectHistory.value.length > 5) expectHistory.value.pop();
        }
        
        // 吉运有三计算：至少投出3枚花钱时，获得8源石锭+1希望
        function calculateJiyunyousan() {
            const total = totalCoins.value;
            const draw = drawCount.value;
            if (total < draw) return;
            
            const prob = getAtLeast3SpendProb();
            const expectedYuan = relicThrowCount.value * prob * 8;
            const expectedHope = relicThrowCount.value * prob * 1;
            
            const result = {
                coinName: '吉运有三',
                expectedValue: `${expectedYuan.toFixed(2)}源石锭 + ${expectedHope.toFixed(2)}希望`,
                benefitUnit: '',
                detail: `投钱${relicThrowCount.value}次 | 至少3花概率: ${(prob * 100).toFixed(2)}%`
            };
            expectResult.value = result;
            expectHistory.value.unshift(result);
            if (expectHistory.value.length > 5) expectHistory.value.pop();
        }
        
        // 监听钱盒变化
        watch(coinBox, () => {
            // 可以在这里添加其他逻辑
        }, { deep: true });

        // 筹谋交换相关
        const planSelectedSlot = ref(null);
        const planSelectedCoin = ref(null);
        const planExchangeResult = ref({});
        const planExchangeMode = ref(false);
        
        // 筹谋交换池配置
        const exchangePools = {
            A: {
                name: 'A池（高级）',
                // 正常交换
                normal: ['聚力则强', '人间长存', '茧成绢', '火上之灶', '鸭爵金币', '鸿蒙开荒', '神秘商贾', '诛邪雷法', '商路难行', '孜孜不倦', '平沙之盾'],
                // 无法被换出但能交换出本池通宝
                cannotExchangeOut: ['圣诏封神'],
                // 再次交换后降级到B池
                downgradeToB: ['黑子伏', '触锁代币', '延识镇木'],
                // 再次交换后降级到C池
                downgradeToC: ['武人之争', '百业俱兴']
            },
            B: {
                name: 'B池（中级）',
                // 正常交换
                normal: ['生材百相', '庆丰收', '塞上月', '军屯垦', '合乎礼', '战血流', '遇良弈', '隐市忧', '法与律', '两江春', '凡物变', '神农守', '梦奇物', '一字落', '待机缘', '画人间', '恣狂情', '己任重', '黑子伏', '界园行', '债难偿', '触锁代币', '延识镇木', '移山难', '初有文', '勤运体', '安硕鼷'],
                // 升级通宝（由特定通宝升级产生）
                upgrades: {
                    '移山难': ['移山繁'],
                    '初有文': ['载道远'],
                    '勤运体': ['修性情', '心无患']
                },
                // 升级后的通宝列表
                upgradedCoins: ['移山繁', '载道远', '修性情', '心无患'],
                // 无法被换出但能交换出本池通宝
                cannotExchangeOut: ['诡意代币', '朝闻道', '天下先'],
                // 再次交换后降级到C池
                downgradeToC: ['驰道长', '寒窗志', '志欲遂', '慧避灾'],
                // 再次交换后升级到A池
                upgradeToA: ['平沙之盾']
            },
            C: {
                name: 'C池（低级）',
                // 正常交换
                normal: ['奇土生金', '水生木护', '金寒水衍', '投木炎延', '火灼土沃', '苦寒', '匪风', '霖雨', '霹雳', '旱热', '虹霓', '雾凇', '霜雪', '重铠', '挪移', '迅步', '火机']
            }
        };
        
        // 不参与交换的通宝
        const nonExchangeable = ['岁醒天时', '无皎之昧'];
        
        // 随盒赠钱中无法被交换出但在C池交换的通宝
        const suiheInCPool = ['大炎通宝', '西廉贞', '北刺面', '南见山', '东缺角'];
        
        // 获取通宝的标记类型（用于显示升级/降级标签）
        function getCoinMark(coinName) {
            // A池降级到B池
            if (exchangePools.A.downgradeToB?.includes(coinName)) {
                return { type: 'downgrade', text: '↓' };
            }
            // A池降级到C池
            if (exchangePools.A.downgradeToC?.includes(coinName)) {
                return { type: 'downgrade', text: '↓' };
            }
            // B池降级到C池
            if (exchangePools.B.downgradeToC?.includes(coinName)) {
                return { type: 'downgrade', text: '↓' };
            }
            // B池升级到A池
            if (exchangePools.B.upgradeToA?.includes(coinName)) {
                return { type: 'upgrade', text: '↑' };
            }
            // B池升级产物
            if (exchangePools.B.upgradedCoins?.includes(coinName)) {
                return { type: 'upgraded', text: '★' };
            }
            // 可升级的通宝
            if (exchangePools.B.upgrades && exchangePools.B.upgrades[coinName]) {
                return { type: 'canUpgrade', text: '↑' };
            }
            return null;
        }
        
        // 获取通宝所在的池和类型
        function getCoinPoolInfo(coinName) {
            // 检查是否不参与交换
            if (nonExchangeable.includes(coinName)) {
                return { pool: null, type: 'nonExchangeable' };
            }
            
            // 检查是否是随盒赠钱中在C池交换的通宝
            if (suiheInCPool.includes(coinName)) {
                return { pool: 'C', type: 'suiheInC', cannotOut: true };
            }
            
            // 检查A池
            if (exchangePools.A.normal.includes(coinName)) {
                return { pool: 'A', type: 'normal' };
            }
            if (exchangePools.A.cannotExchangeOut?.includes(coinName)) {
                return { pool: 'A', type: 'cannotOut', cannotOut: true };
            }
            if (exchangePools.A.downgradeToB?.includes(coinName)) {
                return { pool: 'A', type: 'downgradeToB', targetPool: 'B' };
            }
            if (exchangePools.A.downgradeToC?.includes(coinName)) {
                return { pool: 'A', type: 'downgradeToC', targetPool: 'C' };
            }
            
            // 检查B池
            if (exchangePools.B.normal.includes(coinName)) {
                return { pool: 'B', type: 'normal' };
            }
            if (exchangePools.B.upgradedCoins?.includes(coinName)) {
                return { pool: 'B', type: 'upgraded' };
            }
            if (exchangePools.B.cannotExchangeOut?.includes(coinName)) {
                return { pool: 'B', type: 'cannotOut', cannotOut: true };
            }
            if (exchangePools.B.downgradeToC?.includes(coinName)) {
                return { pool: 'B', type: 'downgradeToC', targetPool: 'C' };
            }
            if (exchangePools.B.upgradeToA?.includes(coinName)) {
                return { pool: 'B', type: 'upgradeToA', targetPool: 'A' };
            }
            
            // 检查C池
            if (exchangePools.C.normal.includes(coinName)) {
                return { pool: 'C', type: 'normal' };
            }
            
            return { pool: null, type: 'unknown' };
        }
        
        // 计算交换结果
        function calculateExchangeResult(coin) {
            const coinName = coin.name;
            const poolInfo = getCoinPoolInfo(coinName);
            
            // 不参与交换
            if (poolInfo.type === 'nonExchangeable') {
                return { cannotExchange: true, reason: '该通宝不参与通宝交换' };
            }
            
            // 未知通宝
            if (!poolInfo.pool) {
                return { cannotExchange: true, reason: '该通宝不在交换池中' };
            }
            
            // 确定目标池
            let targetPool = poolInfo.targetPool || poolInfo.pool;
            let upgradeInfo = null;
            
            if (poolInfo.type === 'downgradeToB') {
                upgradeInfo = { type: 'downgrade', text: '降级到B池' };
            } else if (poolInfo.type === 'downgradeToC') {
                upgradeInfo = { type: 'downgrade', text: '降级到C池' };
            } else if (poolInfo.type === 'upgradeToA') {
                upgradeInfo = { type: 'upgrade', text: '升级到A池' };
            }
            
            // 检查是否有升级通宝
            let upgradeCoins = [];
            if (poolInfo.pool === 'B' && exchangePools.B.upgrades[coinName]) {
                upgradeCoins = exchangePools.B.upgrades[coinName];
                upgradeInfo = { type: 'upgrade', text: '可升级' };
            }
            
            // 获取目标池的所有可交换通宝
            const targetPoolConfig = exchangePools[targetPool];
            let possibleCoinNames = [...targetPoolConfig.normal];
            
            // 添加可以交换出的特殊通宝（降级/升级通宝也可以被交换到）
            if (targetPoolConfig.downgradeToB) possibleCoinNames.push(...targetPoolConfig.downgradeToB);
            if (targetPoolConfig.downgradeToC) possibleCoinNames.push(...targetPoolConfig.downgradeToC);
            if (targetPoolConfig.upgradeToA) possibleCoinNames.push(...targetPoolConfig.upgradeToA);
            if (targetPoolConfig.upgradedCoins) possibleCoinNames.push(...targetPoolConfig.upgradedCoins);
            
            // 关键修正：如果当前通宝不是"无法被换出"类型，则排除那些"无法被换出"的通宝
            // 因为"无法被换出"的通宝只能自己换出去，别人换不到它
            if (!poolInfo.cannotOut && targetPoolConfig.cannotExchangeOut) {
                possibleCoinNames = possibleCoinNames.filter(name => !targetPoolConfig.cannotExchangeOut.includes(name));
            }
            
            // 如果有升级通宝，优先显示升级通宝
            if (upgradeCoins.length > 0) {
                // 检查钱盒中是否已有升级后的通宝
                const coinBoxNames = coinBox.value.filter(c => c).map(c => c.name);
                const availableUpgrades = upgradeCoins.filter(name => !coinBoxNames.includes(name));
                
                if (availableUpgrades.length > 0) {
                    // 有可用的升级通宝
                    const upgradePossibleCoins = allCoins.value.filter(c => availableUpgrades.includes(c.name));
                    return {
                        cannotExchange: false,
                        poolName: targetPoolConfig.name,
                        upgradeInfo: { type: 'upgrade', text: '升级' },
                        possibleCoins: upgradePossibleCoins,
                        isUpgrade: true
                    };
                }
            }
            
            // 排除钱盒中已有的通宝（除了当前选中的，交换可以获得相同通宝）
            const coinBoxNames = coinBox.value
                .filter((c, idx) => c && idx !== planSelectedSlot.value)
                .map(c => c.name);
            possibleCoinNames = possibleCoinNames.filter(name => !coinBoxNames.includes(name));
            
            // 获取通宝详细信息
            const possibleCoins = allCoins.value.filter(c => possibleCoinNames.includes(c.name));
            
            return {
                cannotExchange: false,
                poolName: targetPoolConfig.name,
                upgradeInfo,
                possibleCoins
            };
        }
        
        // 开始交换
        function startPlanExchange() {
            planExchangeMode.value = true;
            planSelectedSlot.value = null;
            planSelectedCoin.value = null;
            planExchangeResult.value = {};
        }
        
        // 结束交换
        function endPlanExchange() {
            planExchangeMode.value = false;
            planSelectedSlot.value = null;
            planSelectedCoin.value = null;
            planExchangeResult.value = {};
        }
        
        // 选择筹谋中的通宝进行交换
        function selectPlanCoinForExchange(idx) {
            if (!planExchangeMode.value) return;
            const coin = coinBox.value[idx];
            if (!coin) return;
            
            planSelectedSlot.value = idx;
            planSelectedCoin.value = coin;
            planExchangeResult.value = calculateExchangeResult(coin);
        }
        
        // 选择槽位（兼容筹谋模式）
        function selectSlot(idx) {
            if (planExchangeMode.value) {
                selectPlanCoinForExchange(idx);
            } else {
                // 方式2：先选通宝再选槽位
                if (pendingCoin.value) {
                    if (!canAddCoin(pendingCoin.value, idx)) {
                        alert(`钱盒内已有【${pendingCoin.value.name}】，无法添加重复通宝`);
                        return;
                    }
                    saveCoinBoxState();
                    coinBox.value[idx] = { ...pendingCoin.value };
                    pendingCoin.value = null;
                    selectedSlot.value = null;
                    return;
                }
                // 方式1：先选槽位再选通宝
                selectedSlot.value = selectedSlot.value === idx ? null : idx;
            }
        }
        
        // 确认交换
        function confirmExchange(newCoin) {
            if (planSelectedSlot.value !== null) {
                saveCoinBoxState();
                coinBox.value[planSelectedSlot.value] = { ...newCoin };
                planSelectedSlot.value = null;
                planSelectedCoin.value = null;
                planExchangeResult.value = {};
            }
        }

        return {
            mode,
            loading,
            categories,
            selectedCategory,
            allCoins,
            filteredCoins,
            coinBox,
            coinBoxRows,
            selectedSlot,
            selectSlot,
            replaceCoin,
            handleCoinClick,
            pendingCoin,
            previewCoin,
            typeNames,
            spendCount,
            liCount,
            hengCount,
            coinBoxHistory,
            coinBoxFuture,
            undoCoinBox,
            redoCoinBox,
            drawCount,
            coinBoxCapacity,
            coinType,
            condition,
            targetCount,
            comboSpend,
            comboLi,
            comboHeng,
            currentResult,
            history,
            calculateProbability,
            expectCategory,
            expectTarget,
            calculableCoins,
            throwCount,
            expectResult,
            expectHistory,
            baseYuanshiding,
            jcjMode,
            jcjThrowCount,
            jcjTargetYuan,
            calculateXiuXingQing,
            calculateJianChengJuan,
            expectRelicTarget,
            relicThrowCount,
            calculableRelics,
            calculateYishishou,
            calculateJiyunyousan,
            planSelectedSlot,
            planSelectedCoin,
            planExchangeResult,
            planExchangeMode,
            startPlanExchange,
            endPlanExchange,
            selectPlanCoinForExchange,
            confirmExchange,
            selectSlot,
            getCoinMark
        };
    }
}).mount('#app');