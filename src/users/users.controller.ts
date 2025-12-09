import { Controller, Get, Patch, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankingDetailsDto } from './dto/update-banking-details.dto';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/banking-details')
  async updateBankingDetails(
    @Param('id') id: string,
    @Body() updateBankingDetailsDto: UpdateBankingDetailsDto,
  ) {
    return this.usersService.updateBankingDetails(id, updateBankingDetailsDto);
  }
}
