import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBankingDetailsDto {
  @ApiProperty({
    description: 'Agência bancária (4 a 10 dígitos)',
    example: '1234',
    pattern: '^\\d{4,10}$',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,10}$/, {
    message: 'Agência deve conter apenas números e ter entre 4 e 10 dígitos',
  })
  agency: string;

  @ApiProperty({
    description: 'Número da conta bancária (5 a 20 dígitos)',
    example: '12345678',
    pattern: '^\\d{5,20}$',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5,20}$/, {
    message:
      'Número da conta deve conter apenas números e ter entre 5 e 20 dígitos',
  })
  accountNumber: string;
}
