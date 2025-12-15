import { IsString, IsEmail, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateBankingDetailsDto } from './update-banking-details.dto';

export class UpdateUserDto {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João Silva',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    description: 'Email do usuário',
    example: 'joao.silva@example.com',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'Endereço do usuário',
    example: 'Rua das Flores, 123 - São Paulo, SP',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    description: 'Dados bancários do usuário',
    type: UpdateBankingDetailsDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBankingDetailsDto)
  bankingDetails?: UpdateBankingDetailsDto;
}
