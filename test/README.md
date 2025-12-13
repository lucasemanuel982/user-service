# Testes de Integração - User Service

Este documento descreve como executar os testes de integração do microsserviço de clientes.

## Pré-requisitos

Antes de executar os testes de integração, você precisa ter os seguintes serviços rodando:

1. **PostgreSQL** - Banco de dados
2. **Redis** - Cache
3. **RabbitMQ** - Broker de mensageria

### Opção 1: Usar Docker Compose (Recomendado)

A forma mais fácil é usar o Docker Compose do projeto:

```bash
# Na raiz do projeto
cd ../..
docker-compose up -d postgres-user redis rabbitmq
```

Aguarde alguns segundos para os serviços iniciarem completamente.

### Opção 2: Serviços Locais

Se você tem PostgreSQL, Redis e RabbitMQ instalados localmente, certifique-se de que estão rodando e configurados corretamente.

## Configuração de Variáveis de Ambiente

Os testes de integração carregam automaticamente as variáveis de ambiente do arquivo `.env` (se existir) e usam valores padrão caso não estejam configuradas.

### Valores Padrão (usados se .env não existir)

- `DATABASE_URL`: `postgresql://user_service:user_service_pass@localhost:5432/user_service_db`
- `REDIS_HOST`: `localhost`
- `REDIS_PORT`: `6379`
- `RABBITMQ_URL`: `amqp://admin:admin123@localhost:5672/`
- `JWT_SECRET`: `test-jwt-secret-key-for-testing-only`
- `JWT_REFRESH_SECRET`: `test-jwt-refresh-secret-key-for-testing-only`
- `JWT_ACCESS_TOKEN_EXPIRES_IN`: `20m`
- `JWT_REFRESH_TOKEN_EXPIRES_IN`: `7d`

### Configuração Personalizada

Se você quiser usar valores diferentes, crie um arquivo `.env` na raiz do projeto com as variáveis necessárias:

```env
# Banco de Dados PostgreSQL
DATABASE_URL=postgresql://user_service:user_service_pass@localhost:5432/user_service_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://admin:admin123@localhost:5672/

# JWT (para autenticação nos testes)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-jwt-key-change-in-production
JWT_ACCESS_TOKEN_EXPIRES_IN=20m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d
```

## Executando os Testes

### Executar todos os testes de integração

```bash
# No diretório user/user-service
npm run test:e2e
```

### Executar um arquivo específico

```bash
# Executar apenas os testes de users
npm run test:e2e -- users.e2e-spec.ts
```

### Executar em modo watch (desenvolvimento)

```bash
npm run test:e2e -- --watch
```

### Executar com cobertura

```bash
npm run test:e2e -- --coverage
```

## Estrutura dos Testes

Os testes de integração estão organizados em suites que testam:

### 1. GET /api/users/:id
- Retorno de usuário autenticado e autorizado
- Verificação de autorização (403 quando acessa outro usuário)
- Verificação de autenticação (401 quando não autenticado)
- Uso de cache do Redis
- Tratamento de usuário não encontrado (404)

### 2. PATCH /api/users/:id
- Atualização de nome, email e endereço
- Atualização de dados bancários com publicação de evento
- Atualização de múltiplos campos
- Invalidação de cache após atualização
- Verificação de autorização
- Validação de campos obrigatórios

### 3. PATCH /api/users/:id/profile-picture
- Upload de foto de perfil válida
- Validação de tipo de arquivo
- Validação de tamanho de arquivo
- Verificação de autorização

### 4. PATCH /api/users/:id/banking-details
- Atualização de dados bancários
- Criação de dados bancários se não existirem
- Tratamento de usuário não encontrado

### 5. Integração com PostgreSQL
- Persistência de dados
- Integridade referencial entre User e BankingDetails

### 6. Integração com Redis
- Armazenamento no cache
- Invalidação de cache após atualizações

### 7. Integração com RabbitMQ
- Publicação de eventos quando dados bancários são atualizados
- Tratamento quando RabbitMQ não está disponível

## Limpeza de Dados

Os testes são configurados para limpar automaticamente os dados após cada execução:

- Dados de usuários são removidos do PostgreSQL
- Cache do Redis é limpo
- Cada teste cria seus próprios dados de teste


### Erro: "Cannot connect to database"

**Solução**: Verifique se o PostgreSQL está rodando e se a `DATABASE_URL` está correta.

```bash
# Verificar se PostgreSQL está rodando
docker-compose ps postgres-user

# Verificar logs
docker-compose logs postgres-user
```

### Erro: "Redis connection failed"

**Solução**: Verifique se o Redis está rodando.

```bash
# Verificar se Redis está rodando
docker-compose ps redis

# Testar conexão
redis-cli ping
```

### Erro: "RabbitMQ connection failed"

**Solução**: Verifique se o RabbitMQ está rodando. Os testes continuarão funcionando mesmo se o RabbitMQ não estiver disponível, mas os testes de publicação de eventos podem falhar.

```bash
# Verificar se RabbitMQ está rodando
docker-compose ps rabbitmq

# Verificar logs
docker-compose logs rabbitmq
```

### Erro: "Port already in use"

**Solução**: Verifique se alguma porta está em uso e altere no `.env` ou pare o serviço que está usando a porta.

### Testes falhando por timeout

**Solução**: Aumente o timeout do Jest no arquivo `jest-e2e.json`:

```json
{
  "testTimeout": 30000
}
```

## Executando em CI/CD

Para executar em pipelines de CI/CD, você pode usar Testcontainers ou configurar serviços de teste. Exemplo com Docker Compose:

```yaml
# .github/workflows/test.yml (exemplo)
- name: Start services
  run: docker-compose up -d postgres-user redis rabbitmq
  
- name: Wait for services
  run: |
    sleep 10
    docker-compose ps
    
- name: Run integration tests
  run: |
    cd user/user-service
    npm run test:e2e
```

## Próximos Passos

Após executar os testes com sucesso, você pode:

1. Verificar a cobertura de testes: `npm run test:e2e -- --coverage`
2. Executar testes unitários: `npm run test`
3. Executar todos os testes: `npm run test && npm run test:e2e`
