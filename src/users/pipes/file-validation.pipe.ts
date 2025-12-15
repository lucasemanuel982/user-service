import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

export interface FileValidationOptions {
  maxSize?: number; // em bytes
  allowedMimeTypes?: string[];
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly maxSize: number;
  private readonly allowedMimeTypes: string[];

  constructor(options: FileValidationOptions = {}) {
    this.maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB padrão
    this.allowedMimeTypes = options.allowedMimeTypes || [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
  }

  transform(value: Express.Multer.File) {
    if (!value) {
      throw new BadRequestException('Arquivo não fornecido');
    }

    if (value.size > this.maxSize) {
      const maxSizeMB = this.maxSize / (1024 * 1024);
      throw new BadRequestException(
        `Arquivo muito grande. Tamanho máximo permitido: ${maxSizeMB}MB`,
      );
    }

    if (!this.allowedMimeTypes.includes(value.mimetype)) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido. Tipos permitidos: ${this.allowedMimeTypes.join(', ')}`,
      );
    }

    return value;
  }
}
