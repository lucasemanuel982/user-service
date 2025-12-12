import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para extrair informações do usuário autenticado do JWT
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
