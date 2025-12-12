import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankingDetailsDto } from './dto/update-banking-details.dto';
import { UserIdParamDto } from './dto/user-id-param.dto';
import { CurrentUser } from '../security/decorators/current-user.decorator';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param() params: UserIdParamDto,
    @CurrentUser() currentUser: { userId: string; email: string },
  ) {
    if (params.id !== currentUser.userId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso',
      );
    }

    return this.usersService.findOne(params.id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param() params: UserIdParamDto,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: { userId: string; email: string },
  ) {
    if (params.id !== currentUser.userId) {
      throw new ForbiddenException(
        'Você não tem permissão para atualizar este recurso',
      );
    }

    return this.usersService.update(params.id, updateUserDto);
  }

  @Patch(':id/banking-details')
  async updateBankingDetails(
    @Param('id') id: string,
    @Body() updateBankingDetailsDto: UpdateBankingDetailsDto,
  ) {
    return this.usersService.updateBankingDetails(id, updateBankingDetailsDto);
  }
}
