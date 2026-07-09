const { createApp, ref, computed, watch, onMounted } = Vue;

// Supabase 配置
const SUPABASE_URL = 'https://vsxzzxqwnipgwumhlczd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UvLloV7W1DEyhBDu8mMMRw_oeuSp8e0';

const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/tongbao-images`;

// 类型映射
const typeMap = { '花': 'spend', '厉': 'li', '衡': 'heng' };
const typeNames = { spend: '花', li: '厉', heng: '衡' };

// 旧分类英文名映射（用于图片路径）
const categoryFolderMap = {
    'suihe': 'suihe', 'daizhu': 'daizhu', 'fugui': 'fugui',
    'liwu': 'liwu', 'tianshi': 'tianshi'
};

// 品相配置（图标使用 Supabase 英文路径）
const PATINA_URL_BASE = `${STORAGE_BASE}/pinxiang`;
const patinasConfig = {
    'rust': { name: '锈色', desc: '投出时，每经过一个节点，获得源石锭+1', icon: `${PATINA_URL_BASE}/patina_rust.png` },
    'protect': { name: '存护', desc: '加入钱盒时，获得护盾值+2', icon: `${PATINA_URL_BASE}/patina_protect.png` },
    'illusion': { name: '入幻', desc: '加入钱盒时，获得希望+1', icon: `${PATINA_URL_BASE}/patina_illusion.png` },
    'light': { name: '引光', desc: '加入钱盒时，获得烛火+1（岁兽残识外叠加至下次进入）', icon: `${PATINA_URL_BASE}/patina_light.png` },
    'tour': { name: '巡游', desc: '投出时，每完成一场战斗，获得票券+1', icon: `${PATINA_URL_BASE}/patina_tour.png` },
    'harmony': { name: '相合', desc: '同时被视为花钱、衡钱、厉钱', icon: `${PATINA_URL_BASE}/patina_harmony.png` },
    'mutable': { name: '易变', desc: '通宝回到钱盒时，变化为随机通宝', icon: `${PATINA_URL_BASE}/patina_mutable.png` },
    'mutableSpend': { name: '易花', desc: '通宝回到钱盒时，变化为随机花钱', icon: `${PATINA_URL_BASE}/patina_mutable_spend.png` },
    'mutableLi': { name: '易厉', desc: '通宝回到钱盒时，变化为随机厉钱', icon: `${PATINA_URL_BASE}/patina_mutable_li.png` },
    'drawn': { name: '受引', desc: '通宝有概率被额外投出（自身未被投出时，30%概率判定成功后投出自身）', icon: `${PATINA_URL_BASE}/patina_drawn.png` }
};

// 将 Supabase 数据转换为应用格式
function convertDBRow(row) {
    const typeKey = typeMap[row.type] || 'heng';
    return {
        id: row.file_name,
        name: row.name,
        type: typeKey,
        effect: row.effect,
        description: row.description,
        source: row.source,
        remark: row.remark,
        category: row.category,
        image: row.image_url,
        benefit: row.benefit_type === '1' ? (row.value || 0) : 0,
        benefitUnit: row.benefit_type === '1' ? '生命上限' : ''
    };
}


createApp({
    setup() {
        const mode = ref('judge');
        const loading = ref(true);
        
        // 品相模式相关
        const patinaMode = ref(false);
        const patinaSelectedSlot = ref(null);
        const patinaSelectedPatina = ref(null);
        
        // 钱盒中通宝的品相映射 { slotIndex: 'patina_key' }
        const coinPatinas = ref({});
        
        // 通宝分类（按类型：厉、花、衡）
        const categories = [
            { id: 'li', name: '厉钱' },
            { id: 'spend', name: '花钱' },
            { id: 'heng', name: '衡钱' }
        ];
        const selectedCategory = ref('spend');
        
        // 所有通宝数据（从CSV加载）
        const allCoins = ref([]);
        
        // 钱盒配置
        const coinBoxCapacity = ref(10); // 钱盒容量
        const drawCount = ref(3); // 每次投钱数量，默认3
        const coinBox = ref([]);
        const selectedSlot = ref(null);
        const enableXiaoba = ref(false); // 小八界开关
        
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
        
        // 从 Supabase 加载通宝数据
        async function loadCoinsData() {
            try {
                const r = await fetch(`${SUPABASE_URL}/rest/v1/tongbao?select=*&order=file_name.asc`, {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                if (!r.ok) throw new Error(await r.text());
                const data = await r.json();
                allCoins.value = data.map(convertDBRow);
                console.log(`从 Supabase 加载了 ${allCoins.value.length} 个通宝`);
                
                // 初始钱盒填充通宝
                coinBox.value = allCoins.value.slice(0, coinBoxCapacity.value);
                loading.value = false;
            } catch (error) {
                console.error('从 Supabase 加载失败，尝试本地 CSV...', error);
                await loadFromLocalCSV();
            }
        }
        
        // 本地 CSV 兜底
        async function loadFromLocalCSV() {
            try {
                const response = await fetch('通宝数据.csv');
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const csvText = await response.text();
                const coins = parseLocalCSV(csvText);
                allCoins.value = coins;
                coinBox.value = coins.slice(0, coinBoxCapacity.value);
                console.log(`从本地 CSV 加载了 ${coins.length} 个通宝（兜底）`);
            } catch (e) {
                console.error('本地 CSV 也加载失败:', e);
            }
            loading.value = false;
        }
        
        function parseLocalCSV(csvText) {
            const lines = csvText.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            const coins = [];
            const catMap = { '随盒赠钱': 'suihe', '待铸子钱': 'daizhu', '富贵商钱': 'fugui', '砺武兵钱': 'liwu', '天师奇钱': 'tianshi' };
            const catEng = { 'suihe': 'suihe', 'daizhu': 'daizhu', 'fugui': 'fugui', 'liwu': 'liwu', 'tianshi': 'tianshi' };
            
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const values = lines[i].split(',');
                const row = {};
                headers.forEach((h, idx) => row[h] = (values[idx] || '').trim());
                if (!row['名称'] || !row['文件']) continue;
                
                const folder = row['分类'] || '随盒赠钱';
                const engFolder = catEng[catMap[folder]] || 'suihe';
                coins.push({
                    id: row['文件'],
                    name: row['名称'],
                    type: typeMap[row['类型']] || 'heng',
                    effect: row['效果'],
                    description: row['描述'],
                    source: row['获取方式'],
                    remark: row['备注'],
                    category: catMap[folder] || 'suihe',
                    image: encodeURI(`界园通宝/${folder}/${row['文件']}.png`),
                    benefit: row['收益类型'] === '1' ? parseInt(row['价值']) || 0 : 0,
                    benefitUnit: row['收益类型'] === '1' ? '生命上限' : ''
                });
            }
            return coins;
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
        
        // 筛选通宝（按类型厉/花/衡）
        const filteredCoins = computed(() => {
            return allCoins.value.filter(c => c.type === selectedCategory.value);
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
        
        // 可重复添加的通宝ID（原随盒赠钱及圣诏封神）
        const allowDuplicateIds = [
            'rogue_5_copper_B_01', 'rogue_5_copper_B_02', 'rogue_5_copper_B_03',
            'rogue_5_copper_B_04', 'rogue_5_copper_B_05', 'rogue_5_copper_B_06',
            'rogue_5_copper_B_07', 'rogue_5_copper_B_08', 'rogue_5_copper_B_09',
            'rogue_5_copper_B_10', 'rogue_5_copper_S_4'
        ];
        
        // 检查通宝是否可以添加到钱盒（重复限制）
        function canAddCoin(coin, targetSlotIndex) {
            // 随盒赠钱和圣诏封神可以重复
            if (allowDuplicateIds.includes(coin.id)) {
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
        const judgeMode = ref('throw'); // 'throw' 或 'combo'
        const coinType = ref('spend');
        const condition = ref('atleast');
        const targetCount = ref(1);
        const currentResult = ref(null);
        const history = ref([]);
        
        // 指定组合模式
        const selectedComboCoins = ref([]); // 选中的通宝列表
        const comboMode = ref('include'); // 'include' 或 'exclude'
        const comboSelectMode = ref(false); // 是否进入选取模式
        const comboAllowPartial = ref(true); // 允许部分指定
        const comboExcludeMode = ref(false); // 排除模式（保留兼容性）
        
        // 旧的指定组合（保留兼容性）
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
        
        // 开始指定/排除组合选取
        function startComboSelect(mode) {
            comboMode.value = mode;
            comboSelectMode.value = true;
            selectedComboCoins.value = [];
            comboAllowPartial.value = true;
        }
        
        // 取消组合选取
        function cancelComboSelect() {
            comboSelectMode.value = false;
            selectedComboCoins.value = [];
        }
        
        // 从右侧钱盒添加通宝到指定组合
        function addToComboCoin(coin) {
            if (selectedComboCoins.value.length < drawCount.value) {
                selectedComboCoins.value.push(coin);
            }
        }
        
        // 从指定组合移除通宝
        function removeFromCombo(idx) {
            selectedComboCoins.value.splice(idx, 1);
        }
        
        // 计算指定组合的概率
        function calculateComboProbability() {
            const total = totalCoins.value;
            let draw = drawCount.value;
            
            // 计算钱盒中有多少通宝附着了受引品相
            let drawnCoinCount = 0;
            for (let i = 0; i < coinBox.value.length; i++) {
                if (coinPatinas.value[i] === 'drawn') {
                    drawnCoinCount++;
                }
            }
            
            if (total < draw) return;
            
            let probability = 0;
            let description = '';
            
            if (comboMode.value === 'exclude') {
                // 排除模式：计算不投出指定通宝的概率
                const excludedCoins = selectedComboCoins.value;
                const excludedCount = excludedCoins.length;
                const availableCoins = total - excludedCount;
                
                if (availableCoins < draw) {
                    probability = 0;
                    description = '可用通宝不足';
                } else {
                    probability = combination(availableCoins, draw) / combination(total, draw);
                    const excludedNames = excludedCoins.map(c => c.name).join('、');
                    description = `不投出${excludedNames}`;
                }
            } else if (comboMode.value === 'include') {
                // 指定模式
                if (comboAllowPartial.value && selectedComboCoins.value.length < draw) {
                    // 部分指定模式：指定的通宝必须投出，剩余随意
                    const specifiedCoins = selectedComboCoins.value;
                    const specifiedCount = specifiedCoins.length;
                    const remainingSlots = draw - specifiedCount;
                    const remainingCoins = total - specifiedCount;
                    
                    if (remainingCoins < remainingSlots) {
                        probability = 0;
                        description = '可用通宝不足';
                    } else {
                        // 计算指定通宝都被投出的概率
                        let prob = 1;
                        for (let i = 0; i < specifiedCount; i++) {
                            prob *= (total - i - 1) / (draw - i);
                        }
                        probability = prob;
                        const specifiedNames = specifiedCoins.map(c => c.name).join('、');
                        description = `投出${specifiedNames}（剩余${remainingSlots}个随意）`;
                    }
                } else if (selectedComboCoins.value.length === draw) {
                    // 完全指定模式：投出指定的通宝组合
                    const specifiedCoins = selectedComboCoins.value;
                    
                    // 计算投出这个特定组合的概率
                    let prob = 1;
                    for (let i = 0; i < draw; i++) {
                        prob *= 1 / total;
                    }
                    probability = prob;
                    
                    const specifiedNames = specifiedCoins.map(c => c.name).join('、');
                    description = `投出${specifiedNames}`;
                } else {
                    alert('请选择足够的通宝或启用部分指定模式');
                    return;
                }
            }
            
            // 应用额外投出规则（小八界和受引品相）
            if (enableXiaoba.value || drawnCoinCount > 0) {
                let extraChance = 0;
                
                if (enableXiaoba.value) {
                    extraChance += 0.15;
                }
                if (drawnCoinCount > 0) {
                    const undrawnDrawnCoins = drawnCoinCount * 0.5;
                    extraChance += undrawnDrawnCoins * 0.3 / draw;
                }
                
                extraChance = Math.min(extraChance, 1);
                
                let baseProbability = probability * (1 - extraChance);
                let extraProbability = 0;
                
                // 额外投出1枚的概率（简化计算）
                const extraDraw = draw + 1;
                if (total >= extraDraw) {
                    extraProbability = probability * 0.5; // 简化估计
                }
                
                probability = baseProbability + extraProbability * extraChance;
                
                const modifiers = [];
                if (enableXiaoba.value) modifiers.push('小八界');
                if (drawnCoinCount > 0) modifiers.push(`受引×${drawnCoinCount}`);
                if (modifiers.length > 0) {
                    description += `（${modifiers.join('+')}）`;
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
        
        // 计算概率
        function calculateProbability() {
            const total = totalCoins.value;
            let draw = drawCount.value;
            
            // 计算钱盒中有多少通宝附着了受引品相
            let drawnCoinCount = 0;
            for (let i = 0; i < coinBox.value.length; i++) {
                if (coinPatinas.value[i] === 'drawn') {
                    drawnCoinCount++;
                }
            }
            
            if (total < draw) return;
            
            let probability = 0;
            let description = '';
            
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
            
            // 应用额外投出规则（小八界和受引品相）
            if (enableXiaoba.value || drawnCoinCount > 0) {
                
                let baseProbability = probability;
                let extraProbability = 0;
                let extraChance = 0;
                
                // 计算额外投出的概率
                if (enableXiaoba.value) {
                    extraChance += 0.15; // 小八界15%
                }
                if (drawnCoinCount > 0) {
                    // 受引：未被投出的受引通宝有30%概率额外投出
                    // 简化计算：假设平均有drawnCoinCount/2个未被投出
                    const undrawnDrawnCoins = drawnCoinCount * 0.5;
                    extraChance += undrawnDrawnCoins * 0.3 / draw; // 平均每枚通宝的额外投出概率
                }
                
                // 限制extraChance不超过1
                extraChance = Math.min(extraChance, 1);
                
                // 基础概率（不额外投出）
                baseProbability = probability * (1 - extraChance);
                
                // 额外投出1枚的概率
                const extraDraw = draw + 1;
                if (total >= extraDraw) {
                    if (condition.value === 'exact') {
                        if (targetCount.value <= targetCoinCount && targetCount.value <= extraDraw) {
                            extraProbability = combination(targetCoinCount, targetCount.value) * 
                                             combination(total - targetCoinCount, extraDraw - targetCount.value) / 
                                             combination(total, extraDraw);
                        }
                    } else {
                        for (let i = targetCount.value; i <= Math.min(extraDraw, targetCoinCount); i++) {
                            extraProbability += combination(targetCoinCount, i) * 
                                              combination(total - targetCoinCount, extraDraw - i) / 
                                              combination(total, extraDraw);
                        }
                    }
                }
                
                probability = baseProbability + extraProbability * extraChance;
                
                const modifiers = [];
                if (enableXiaoba.value) modifiers.push('小八界');
                if (drawnCoinCount > 0) modifiers.push(`受引×${drawnCoinCount}`);
                if (modifiers.length > 0) {
                    description += `（${modifiers.join('+')}）`;
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
        
        // 品相模式函数
        function startPatinaMode() {
            patinaMode.value = true;
            patinaSelectedSlot.value = null;
            patinaSelectedPatina.value = null;
        }
        
        function endPatinaMode() {
            patinaMode.value = false;
            patinaSelectedSlot.value = null;
            patinaSelectedPatina.value = null;
        }
        
        function selectCoinForPatina(idx) {
            if (!coinBox.value[idx]) return;
            patinaSelectedSlot.value = patinaSelectedSlot.value === idx ? null : idx;
            patinaSelectedPatina.value = null; // 重置选中的品相
        }
        
        function selectPatina(patinaKey) {
            patinaSelectedPatina.value = patinaKey;
        }
        
        function applyPatina(patinaKey) {
            if (patinaSelectedSlot.value === null) return;
            coinPatinas.value[patinaSelectedSlot.value] = patinaKey;
            patinaSelectedSlot.value = null;
            patinaSelectedPatina.value = null;
        }
        
        function removePatina(idx) {
            delete coinPatinas.value[idx];
        }
        
        function getPatinaForSlot(idx) {
            return coinPatinas.value[idx] || null;
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
            patinaMode,
            patinaSelectedSlot,
            patinaSelectedPatina,
            coinPatinas,
            patinasConfig,
            startPatinaMode,
            endPatinaMode,
            selectCoinForPatina,
            selectPatina,
            applyPatina,
            removePatina,
            getPatinaForSlot,
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
            enableXiaoba,
            judgeMode,
            coinType,
            condition,
            targetCount,
            selectedComboCoins,
            comboMode,
            comboSelectMode,
            comboAllowPartial,
            startComboSelect,
            cancelComboSelect,
            addToComboCoin,
            removeFromCombo,
            calculateComboProbability,
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