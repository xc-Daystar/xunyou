-- =====================================================
-- 通宝数据表 — 在 Supabase SQL Editor 中执行
-- =====================================================

-- 1. 创建通宝数据表
CREATE TABLE IF NOT EXISTS tongbao (
    id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name       text NOT NULL UNIQUE,
    category        text DEFAULT '',
    type            text NOT NULL DEFAULT '衡',
    name            text NOT NULL,
    effect          text DEFAULT '',
    description     text DEFAULT '',
    source          text DEFAULT '',
    benefit_type    text DEFAULT '',
    value           integer DEFAULT 0,
    rarity          text DEFAULT '',
    remark          text DEFAULT '',
    image_url       text DEFAULT '',
    created_at      timestamptz DEFAULT now()
);

-- 2. 启用行级安全
ALTER TABLE tongbao ENABLE ROW LEVEL SECURITY;

-- 3. 所有人都可以读取（用于网页展示）
DROP POLICY IF EXISTS "允许所有人读取通宝" ON tongbao;
CREATE POLICY "允许所有人读取通宝"
ON tongbao FOR SELECT
USING (true);

-- 4. 只有认证用户（管理员）可以增删改
DROP POLICY IF EXISTS "管理员可新增通宝" ON tongbao;
CREATE POLICY "管理员可新增通宝"
ON tongbao FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "管理员可更新通宝" ON tongbao;
CREATE POLICY "管理员可更新通宝"
ON tongbao FOR UPDATE
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "管理员可删除通宝" ON tongbao;
CREATE POLICY "管理员可删除通宝"
ON tongbao FOR DELETE
USING (auth.role() = 'authenticated');

-- 5. 图片存储桶的公开访问策略 (storage.objects 是系统内置表)
--    任何人（含未登录）都可以读取图片
CREATE POLICY "Public_Read_Tongbao_Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'tongbao-images');

--    只有认证用户（管理员）可以上传图片
CREATE POLICY "Auth_Insert_Tongbao_Images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tongbao-images' AND auth.role() = 'authenticated');

--    只有认证用户可以更新图片
CREATE POLICY "Auth_Update_Tongbao_Images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tongbao-images' AND auth.role() = 'authenticated');

--    只有认证用户可以删除图片
CREATE POLICY "Auth_Delete_Tongbao_Images"
ON storage.objects FOR DELETE
USING (bucket_id = 'tongbao-images' AND auth.role() = 'authenticated');

-- =====================================================
-- 注意：以下 2 步无法用 SQL 完成，必须在 Supabase 网页端操作
-- =====================================================
-- ⬜ A. 启用邮箱登录
--      路径：Authentication → Providers → Email → Enable → 关闭"Confirm email"
--
-- ⬜ B. 创建管理员账号
--      路径：Authentication → Users → Add user → 填写邮箱+密码
