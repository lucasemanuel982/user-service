-- Migration: Add role column to users table
-- Description: Adiciona campo role para controle de acesso baseado em roles
-- Adicionar coluna role na tabela users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user';
-- Criar índice para otimizar consultas por role
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
-- Atualizar usuários existentes para ter role 'user' (caso não tenham)
UPDATE users
SET role = 'user'
WHERE role IS NULL
    OR role = '';
-- Comentário na coluna
COMMENT ON COLUMN users.role IS 'Role do usuário: user (padrão), admin, manager';