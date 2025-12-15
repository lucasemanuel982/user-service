import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateBankingDetailsDto } from './dto/update-banking-details.dto';
import { UserIdParamDto } from './dto/user-id-param.dto';
import { CurrentUser } from '../security/decorators/current-user.decorator';
import { FileValidationPipe } from './pipes/file-validation.pipe';
import { RolesGuard } from '../security/guards/roles.guard';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Buscar detalhes de um usuário' })
  @ApiResponse({
    status: 200,
    description: 'Usuário encontrado com sucesso',
    schema: {
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'João Silva',
        email: 'joao.silva@example.com',
        address: 'Rua das Flores, 123 - São Paulo, SP',
        role: 'user',
        bankingDetails: {
          agency: '1234',
          accountNumber: '12345678',
        },
        createdAt: '2025-12-15T10:30:00.000Z',
        updatedAt: '2025-12-15T10:30:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
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
  @ApiOperation({ summary: 'Atualizar dados de um usuário' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: 'Usuário atualizado com sucesso',
    schema: {
      example: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'João Silva',
        email: 'joao.silva@example.com',
        address: 'Rua das Flores, 123 - São Paulo, SP',
        updatedAt: '2025-12-15T10:30:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
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
  @ApiOperation({ summary: 'Atualizar dados bancários de um usuário' })
  @ApiBody({ type: UpdateBankingDetailsDto })
  @ApiResponse({
    status: 200,
    description: 'Dados bancários atualizados com sucesso',
    schema: {
      example: {
        userId: '123e4567-e89b-12d3-a456-426614174000',
        agency: '1234',
        accountNumber: '12345678',
        updatedAt: '2025-12-15T10:30:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @UseGuards(RolesGuard)
  async updateBankingDetails(
    @Param('id') id: string,
    @Body() updateBankingDetailsDto: UpdateBankingDetailsDto,
    @CurrentUser()
    currentUser: { userId: string; email: string; role?: string },
  ) {
    if (
      id !== currentUser.userId &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'manager'
    ) {
      throw new ForbiddenException(
        'Você não tem permissão para atualizar dados bancários de outros usuários',
      );
    }

    return this.usersService.updateBankingDetails(id, updateBankingDetailsDto);
  }

  @Patch(':id/profile-picture')
  @ApiOperation({ summary: 'Atualizar foto de perfil de um usuário' })
  @ApiResponse({ status: 200, description: 'Foto de perfil atualizada com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async updateProfilePicture(
    @Param() params: UserIdParamDto,
    @UploadedFile(new FileValidationPipe())
    file: Express.Multer.File,
    @CurrentUser() currentUser: { userId: string; email: string },
  ) {
    if (params.id !== currentUser.userId) {
      throw new ForbiddenException(
        'Você não tem permissão para atualizar este recurso',
      );
    }

    const fileExtension = file.originalname.split('.').pop();
    const timestamp = Date.now();
    const profilePictureUrl = `/uploads/profile-pictures/${params.id}-${timestamp}.${fileExtension}`;

    return this.usersService.updateProfilePicture(params.id, profilePictureUrl);
  }
}
