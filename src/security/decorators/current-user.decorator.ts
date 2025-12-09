import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para extrair informações do usuário autenticado
 * Será implementado completamente no Card 22
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    // TODO: Extrair informações do usuário do JWT no Card 22
    return request.user;
  },
);

