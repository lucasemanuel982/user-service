import { IsString, IsEmail, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateBankingDetailsDto } from './update-banking-details.dto';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBankingDetailsDto)
  bankingDetails?: UpdateBankingDetailsDto;
}
