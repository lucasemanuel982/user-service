# Documentação - User Service

Este diretório contém a documentação específica do User Service.

## Estrutura

- `redis-structure.md` - Estrutura e uso do Redis para cache, blacklist de tokens e logs de erros

## Schemas e Migrations

- `../prisma/schema.prisma` - Schema Prisma do banco de dados
- `../migrations/` - Scripts de migração SQL

## Como Usar

### Aplicar Migrations

```bash
# Aplicar migration manualmente
psql -U postgres -d user_service_db -f migrations/001_initial_user_service.sql

# Ou usando Prisma
npx prisma migrate deploy
```

### Gerar Prisma Client

```bash
npx prisma generate
```

### Visualizar Schema no Banco

```bash
npx prisma studio
```





