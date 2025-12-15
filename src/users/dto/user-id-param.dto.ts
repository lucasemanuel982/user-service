import { IsUUID, IsNotEmpty, IsString } from 'class-validator';

export class UserIdParamDto {
  @IsString({ message: 'ID do usuário deve ser uma string' })
  @IsNotEmpty({ message: 'ID do usuário é obrigatório' })
  @IsUUID('4', { message: 'ID do usuário deve ser um UUID válido (versão 4)' })
  id: string;
}
