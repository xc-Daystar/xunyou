// =====================================================
// 批量上传图片 + 导入 CSV 数据到 Supabase
// 运行: node setup.mjs
// =====================================================

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://vsxzzxqwnipgwumhlczd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const BUCKET_NAME = 'tongbao-images';
const IMG_DIR = path.join(__dirname, '界园通宝');

// 中文文件夹名 → 英文名映射（Supabase Storage 不支持中文路径）
const folderMap = {
    '随盒赠钱': 'suihe',
    '待铸子钱': 'daizhu',
    '富贵商钱': 'fugui',
    '砺武兵钱': 'liwu',
    '天师奇钱': 'tianshi',
    '通宝品相': 'pinxiang'
};

// 品相图片文件名的英文映射
const patinaFileMap = {
    '通宝_品相_锈色.png': 'patina_rust.png',
    '通宝_品相_存护.png': 'patina_protect.png',
    '通宝_品相_入幻.png': 'patina_illusion.png',
    '通宝_品相_引光.png': 'patina_light.png',
    '通宝_品相_巡游.png': 'patina_tour.png',
    '通宝_品相_相合.png': 'patina_harmony.png',
    '通宝_品相_易变.png': 'patina_mutable.png',
    '通宝_品相_易花.png': 'patina_mutable_spend.png',
    '通宝_品相_易厉.png': 'patina_mutable_li.png',
    '通宝_品相_受引.png': 'patina_drawn.png'
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ========== 1. 创建存储桶 ==========
async function createBucket() {
    console.log('[1/4] 检查/创建存储桶...');
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
        console.error('  获取桶列表失败:', listErr.message);
        process.exit(1);
    }
    const exists = buckets.find(b => b.name === BUCKET_NAME);
    if (exists) {
        console.log(`  桶 "${BUCKET_NAME}" 已存在，跳过创建`);
        return;
    }
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, { public: true });
    if (error) {
        console.error('  创建桶失败:', error.message);
        process.exit(1);
    }
    console.log(`  桶 "${BUCKET_NAME}" 创建成功`);
}

// ========== 2. 上传所有图片 ==========
async function uploadImages() {
    console.log('[2/4] 上传图片...');
    const folders = fs.readdirSync(IMG_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    let total = 0;
    let success = 0;
    let failed = 0;

    for (const folder of folders) {
        const folderPath = path.join(IMG_DIR, folder);
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.png'));

        for (const file of files) {
            total++;
            const filePath = path.join(folderPath, file);
            const fileBuffer = fs.readFileSync(filePath);

            // 使用英文文件夹名，品相图片使用英文文件名
            const engFolder = folderMap[folder] || folder;
            const safeFile = patinaFileMap[file] || file;
            const storagePath = `${engFolder}/${safeFile}`;

            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(storagePath, fileBuffer, {
                    upsert: true,
                    contentType: 'image/png'
                });

            if (error) {
                console.log(`  ✗ ${storagePath}: ${error.message}`);
                failed++;
            } else {
                success++;
                process.stdout.write(`\r  已上传: ${success}/${total} (${engFolder}/${file})`);
            }
        }
    }
    console.log(`\n  完成! 成功 ${success} / 失败 ${failed} / 总计 ${total}`);
}

// ========== 3. 解析并导入 CSV 数据 ==========
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const records = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const record = {};
        headers.forEach((h, idx) => {
            record[h] = (values[idx] || '').trim();
        });
        // 跳过品相图片所在的行（没有名称的无效行）
        if (!record['名称'] || !record['文件']) continue;
        records.push(record);
    }
    return records;
}

async function importCSV() {
    console.log('[3/4] 导入 CSV 数据...');

    const csvPath = path.join(__dirname, '通宝数据.csv');
    if (!fs.existsSync(csvPath)) {
        console.error(`  CSV 文件不存在: ${csvPath}`);
        return;
    }

    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const records = parseCSV(csvText);

    console.log(`  解析到 ${records.length} 条通宝记录`);

    let success = 0;
    let failed = 0;

    for (const r of records) {
        const folder = r['分类'] || '随盒赠钱';
        const engFolder = folderMap[folder] || folder;
        const fileName = r['文件'] + '.png';
        const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${engFolder}/${fileName}`;

        const row = {
            file_name: r['文件'],
            category: r['分类'] || '',
            type: r['类型'] || '衡',
            name: r['名称'],
            effect: r['效果'] || '',
            description: r['描述'] || '',
            source: r['获取方式'] || '',
            benefit_type: r['收益类型'] || '',
            value: parseInt(r['价值']) || 0,
            rarity: r['稀有度'] || '',
            remark: r['备注'] || '',
            image_url: imageUrl
        };

        const { error } = await supabase
            .from('tongbao')
            .upsert(row, { onConflict: 'file_name' });

        if (error) {
            console.log(`  ✗ ${r['名称']}: ${error.message}`);
            failed++;
        } else {
            success++;
            process.stdout.write(`\r  已导入: ${success}/${records.length} - ${r['名称']}`);
        }
    }
    console.log(`\n  完成! 成功 ${success} / 失败 ${failed} / 总计 ${records.length}`);
}

// ========== 4. 配置 Storage 公开访问策略 ==========
async function setStoragePolicy() {
    console.log('[4/4] 配置 Storage 公开访问策略...');
    // 使用 Supabase Storage Policy API
    // 公开读取策略
    try {
        const { data, error } = await supabase.rpc('create_storage_policy', {
            bucket_name: BUCKET_NAME,
            policy_name: 'public_read',
            definition: JSON.stringify({ name: 'Public Read', allowed: true }),
            command: 'SELECT'
        });
        // rpc 方法可能不可用，改用直接 HTTP 请求
    } catch (e) {
        // 如果 RPC 不可用，提示用户手动配置
    }

    console.log('  注意: 请在 Supabase 后台 → Storage → tongbao-images → Policies 中');
    console.log('  手动添加一条 SELECT 策略，允许所有人读取（Provide a name → SELECT → 勾选 Allow public access）');
}

// ========== 主流程 ==========
async function main() {
    console.log('====================================');
    console.log('  通宝数据部署脚本');
    console.log('====================================\n');

    if (!SUPABASE_KEY) {
        console.error('❌ 缺少 SUPABASE_SERVICE_KEY 环境变量');
        console.error('   用法: SUPABASE_SERVICE_KEY=sb_secret_xxx node setup.mjs');
        process.exit(1);
    }

    // 先检查 tongbao 表是否存在
    console.log('检查数据库表...');
    const { error: tableErr } = await supabase.from('tongbao').select('id').limit(1);
    if (tableErr) {
        console.error(`\n❌ tongbao 表不存在! 请先在 Supabase SQL Editor 中执行 setup.sql 建表。`);
        console.error(`   错误: ${tableErr.message}`);
        console.log('\n   操作步骤:');
        console.log('   1. 打开 https://supabase.com/dashboard');
        console.log('   2. 进入项目 → SQL Editor');
        console.log('   3. 粘贴本目录下的 setup.sql 内容');
        console.log('   4. 点击 Run 执行');
        console.log('   5. 然后重新运行本脚本\n');
        process.exit(1);
    }
    console.log('  ✓ tongbao 表存在\n');

    try {
        await createBucket();
        await uploadImages();
        await importCSV();
        await setStoragePolicy();

        console.log('\n====================================');
        console.log('  全部完成! ');
        console.log('  图片库: ' + SUPABASE_URL + '/storage/v1/object/public/' + BUCKET_NAME + '/');
        console.log('  API 地址: ' + SUPABASE_URL + '/rest/v1/tongbao');
        console.log('====================================');
    } catch (err) {
        console.error('\n执行出错:', err.message);
        process.exit(1);
    }
}

main();
