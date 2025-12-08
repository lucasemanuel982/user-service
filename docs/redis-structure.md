# Estrutura do Redis - User Service

## Visão Geral

O Redis é utilizado no User Service para:
1. **Cache de dados de usuários** - Otimização de consultas frequentes
2. **Blacklist de tokens JWT** - Tokens revogados
3. **Logs de erros** - Armazenamento temporário de erros críticos

---

## 1. Cache de Usuários

### Estrutura de Chaves

```
user:{userId}
```

### Formato do Valor

```json
{
  "id": "uuid",
  "name": "Nome do Usuário",
  "email": "usuario@email.com",
  "address": "Endereço completo",
  "bankingDetails": {
    "agency": "0001",
    "accountNumber": "12345-6"
  },
  "profilePictureUrl": "https://...",
  "cachedAt": "2025-01-15T10:30:00Z"
}
```

### TTL (Time To Live)

- **Padrão:** 3600 segundos (1 hora)
- **Configurável:** Via variável de ambiente `REDIS_CACHE_TTL`

### Operações

- **SET:** Armazenar dados do usuário após consulta ao banco
- **GET:** Recuperar dados do usuário do cache
- **DELETE:** Invalidar cache quando dados são atualizados
- **EXPIRE:** Definir TTL automático

### Exemplo de Uso

```typescript
// Armazenar no cache
await redis.setex(
  `user:${userId}`,
  3600, // TTL em segundos
  JSON.stringify(userData)
);

// Recuperar do cache
const cached = await redis.get(`user:${userId}`);
if (cached) {
  return JSON.parse(cached);
}

// Invalidar cache
await redis.del(`user:${userId}`);
```

---

## 2. Blacklist de Tokens JWT

### Estrutura de Chaves

```
token:blacklist:{tokenId}
```

### Formato do Valor

```json
{
  "tokenId": "jti do JWT",
  "userId": "uuid",
  "revokedAt": "2025-01-15T10:30:00Z",
  "expiresAt": "2025-01-22T10:30:00Z"
}
```

### TTL

- **Automático:** Baseado no tempo de expiração do token
- **Refresh Token:** 7 dias (604800 segundos)
- **Access Token:** 20 minutos (1200 segundos) - geralmente não precisa de blacklist

### Operações

- **SET:** Adicionar token à blacklist ao fazer logout
- **GET:** Verificar se token está na blacklist
- **EXPIRE:** TTL automático baseado na expiração do token

### Exemplo de Uso

```typescript
// Adicionar à blacklist
const expiresIn = 604800; // 7 dias
await redis.setex(
  `token:blacklist:${tokenId}`,
  expiresIn,
  JSON.stringify({
    tokenId,
    userId,
    revokedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
  })
);

// Verificar blacklist
const blacklisted = await redis.get(`token:blacklist:${tokenId}`);
if (blacklisted) {
  throw new UnauthorizedException('Token revoked');
}
```

---

## 3. Logs de Erros

### Estrutura de Chaves

#### 3.1 Erro Individual

```
error:{service}:{type}:{timestamp}:{id}
```

**Exemplo:**
```
error:user-service:validation:2025-01-15T10:30:00Z:abc123
```

#### 3.2 Índice de Erros por Serviço

```
error:index:{service}:{date}
```

**Exemplo:**
```
error:index:user-service:2025-01-15
```

#### 3.3 Contador de Erros

```
error:count:{service}:{type}:{date}
```

**Exemplo:**
```
error:count:user-service:validation:2025-01-15
```

### Formato do Valor (Erro Individual)

```json
{
  "errorId": "abc123",
  "service": "user-service",
  "type": "validation",
  "message": "Email inválido",
  "stack": "Error: Email inválido\n    at ...",
  "userId": "uuid",
  "correlationId": "corr-123",
  "timestamp": "2025-01-15T10:30:00Z",
  "metadata": {
    "endpoint": "/api/users/123",
    "method": "PATCH",
    "ipAddress": "192.168.1.1"
  }
}
```

### TTL

- **Erros individuais:** 7 dias (604800 segundos)
- **Índices:** 30 dias (2592000 segundos)
- **Contadores:** 30 dias (2592000 segundos)

### Operações

#### Armazenar Erro

```typescript
const errorKey = `error:${service}:${type}:${timestamp}:${errorId}`;
await redis.setex(
  errorKey,
  604800, // 7 dias
  JSON.stringify(errorData)
);
```

#### Adicionar ao Índice

```typescript
const date = new Date().toISOString().split('T')[0];
const indexKey = `error:index:${service}:${date}`;
await redis.sadd(indexKey, errorKey);
await redis.expire(indexKey, 2592000); // 30 dias
```

#### Incrementar Contador

```typescript
const countKey = `error:count:${service}:${type}:${date}`;
await redis.incr(countKey);
await redis.expire(countKey, 2592000); // 30 dias
```

#### Consultar Erros

```typescript
// Listar todos os erros de um serviço em uma data
const indexKey = `error:index:${service}:${date}`;
const errorKeys = await redis.smembers(indexKey);

// Buscar detalhes de cada erro
const errors = await Promise.all(
  errorKeys.map(key => redis.get(key))
);

// Obter contador de erros
const countKey = `error:count:${service}:${type}:${date}`;
const count = await redis.get(countKey) || 0;
```

---

## 4. Configurações Recomendadas

### Variáveis de Ambiente

```env
# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Cache TTL (em segundos)
REDIS_CACHE_TTL=3600

# Error Logs TTL (em segundos)
REDIS_ERROR_TTL=604800
REDIS_ERROR_INDEX_TTL=2592000
```

### Estratégia de Cache

1. **Cache-Aside Pattern:**
   - Aplicação verifica cache primeiro
   - Se não encontrar, busca no banco
   - Armazena resultado no cache para próximas consultas

2. **Write-Through (opcional):**
   - Ao atualizar dados, atualiza cache também
   - Garante consistência entre cache e banco

3. **Cache Invalidation:**
   - Ao atualizar dados, invalidar cache
   - Usar `DELETE` na chave do cache

---

## 5. Monitoramento

### Métricas Importantes

- **Hit Rate:** Taxa de acertos no cache
- **Miss Rate:** Taxa de falhas no cache
- **Memory Usage:** Uso de memória do Redis
- **Error Count:** Contagem de erros por tipo/serviço

### Comandos Úteis

```bash
# Ver todas as chaves de cache
redis-cli KEYS "user:*"

# Ver todas as chaves de erro
redis-cli KEYS "error:*"

# Ver memória usada
redis-cli INFO memory

# Limpar cache de um usuário específico
redis-cli DEL "user:{userId}"

# Limpar todos os caches (cuidado!)
redis-cli FLUSHDB
```

---

## 6. Considerações de Segurança

1. **Dados Sensíveis:**
   - Não armazenar senhas no cache
   - Não armazenar tokens completos no cache
   - Usar apenas IDs e dados não sensíveis

2. **TTL Adequado:**
   - Cache não deve ficar muito tempo (máx 1 hora)
   - Blacklist deve respeitar expiração do token
   - Erros devem expirar após análise

3. **Isolamento:**
   - Usar diferentes databases do Redis para diferentes propósitos (se necessário)
   - Usar prefixos de chave para organização


