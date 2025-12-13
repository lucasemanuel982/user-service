// Carrega variáveis de ambiente para testes
import { config } from 'dotenv';
import { resolve } from 'path';

// Tenta carregar .env de diferentes locais
// 1. Do diretório user-service
const serviceEnvPath = resolve(process.cwd(), '.env');
config({ path: serviceEnvPath });

// 2. Do diretório raiz do projeto (se não encontrou)
if (!process.env.DATABASE_URL) {
  const rootEnvPath = resolve(process.cwd(), '../../.env');
  config({ path: rootEnvPath });
}

// 3. Do diretório raiz absoluto (última tentativa)
if (!process.env.DATABASE_URL) {
  const absoluteRootPath = resolve(__dirname, '../../../.env');
  config({ path: absoluteRootPath });
}

// Define valores padrão se não estiverem configurados
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://user_service:user_service_pass@localhost:5432/user_service_db';
}

if (!process.env.REDIS_HOST) {
  process.env.REDIS_HOST = 'localhost';
}

if (!process.env.REDIS_PORT) {
  process.env.REDIS_PORT = '6379';
}

if (!process.env.RABBITMQ_URL) {
  process.env.RABBITMQ_URL = 'amqp://admin:admin123@localhost:5672/';
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
}

if (!process.env.JWT_REFRESH_SECRET) {
  process.env.JWT_REFRESH_SECRET =
    'test-jwt-refresh-secret-key-for-testing-only';
}

if (!process.env.JWT_ACCESS_TOKEN_EXPIRES_IN) {
  process.env.JWT_ACCESS_TOKEN_EXPIRES_IN = '20m';
}

if (!process.env.JWT_REFRESH_TOKEN_EXPIRES_IN) {
  process.env.JWT_REFRESH_TOKEN_EXPIRES_IN = '7d';
}
