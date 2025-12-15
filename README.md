# User Service

Microsserviço responsável pelo gerenciamento de usuários e autenticação do sistema bancário.

## Descrição

O User Service é responsável por:
- Gerenciamento de usuários (criação, atualização, consulta)
- Autenticação e autorização (registro, login, logout, refresh token)
- Gerenciamento de perfis e dados bancários
- Upload de fotos de perfil
- Publicação de eventos para outros serviços via RabbitMQ
- Cache de dados usando Redis

## Tecnologias

- NestJS 11
- TypeScript
- PostgreSQL (Prisma ORM)
- Redis (cache e blacklist de tokens)
- RabbitMQ (mensageria)
- JWT (autenticação)
- Swagger/OpenAPI (documentação)

## Pré-requisitos

- Node.js 18+
- PostgreSQL
- Redis
- RabbitMQ
- npm ou yarn

## Instalação

```bash
npm install
```

## Configuração

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Servidor
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

# Banco de dados
DATABASE_URL=postgresql://user:password@localhost:5432/user_service_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=banking_events
```

## Migrations

### Aplicar migrations manualmente

```bash
psql -U postgres -d user_service_db -f migrations/001_initial_user_service.sql
psql -U postgres -d user_service_db -f migrations/002_add_role_to_users.sql
```

### Usar Prisma

```bash
# Gerar Prisma Client
npx prisma generate

# Aplicar migrations
npx prisma migrate deploy

# Visualizar schema no banco
npx prisma studio
```

## Executando o Serviço

### Desenvolvimento

```bash
npm run start:dev
```

### Produção

```bash
npm run build
npm run start:prod
```

### Debug

```bash
npm run start:debug
```

## Documentação da API

Após iniciar o serviço, a documentação Swagger estará disponível em:

```
http://localhost:3001/api/docs
```

## Endpoints Principais

### Autenticação

- `POST /api/auth/register` - Registrar novo usuário
- `POST /api/auth/login` - Fazer login e obter tokens
- `POST /api/auth/refresh` - Renovar access token
- `POST /api/auth/logout` - Fazer logout e invalidar tokens

### Usuários

- `GET /api/users/:id` - Buscar detalhes de um usuário
- `PATCH /api/users/:id` - Atualizar dados de um usuário
- `PATCH /api/users/:id/banking-details` - Atualizar dados bancários
- `PATCH /api/users/:id/profile-picture` - Atualizar foto de perfil


## Testes

### Testes unitários

```bash
npm run test
```

### Testes com cobertura

```bash
npm run test:cov
```

### Testes E2E

```bash
npm run test:e2e
```

## Segurança

- Autenticação JWT com access e refresh tokens
- Refresh tokens armazenados em cookies HttpOnly
- Blacklist de tokens no Redis para logout
- Validação de entrada com class-validator
- Helmet para proteção contra ataques comuns
- Rate limiting com @nestjs/throttler
- Controle de acesso baseado em roles (admin, manager, user)

## Cache

O serviço utiliza Redis para:
- Cache de dados de usuários
- Blacklist de tokens JWT invalidados
- Logs de erros

Mais detalhes em `docs/redis-structure.md`.

## Mensageria

O serviço publica eventos no RabbitMQ quando:
- Usuário é criado
- Dados bancários são atualizados
- Usuário é atualizado

## Docker

### Build da imagem

```bash
docker build -t user-service .
```

### Executar container

```bash
docker run -p 3001:3001 --env-file .env user-service
```

## Scripts Disponíveis

- `npm run build` - Compilar o projeto
- `npm run start` - Iniciar em modo produção
- `npm run start:dev` - Iniciar em modo desenvolvimento com watch
- `npm run start:debug` - Iniciar em modo debug
- `npm run lint` - Executar linter
- `npm run format` - Formatar código com Prettier
- `npm run test` - Executar testes unitários
- `npm run test:watch` - Executar testes em modo watch
- `npm run test:cov` - Executar testes com cobertura
- `npm run test:e2e` - Executar testes E2E
