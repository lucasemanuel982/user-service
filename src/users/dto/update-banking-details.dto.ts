import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class UpdateBankingDetailsDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,10}$/, {
    message: 'Agência deve conter apenas números e ter entre 4 e 10 dígitos',
  })
  agency: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{5,20}$/, {
    message: 'Número da conta deve conter apenas números e ter entre 5 e 20 dígitos',
  })
  accountNumber: string;
}
