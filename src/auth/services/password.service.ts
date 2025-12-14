import { Injectable } from '@nestjs/common';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

/**
 * Serviço para hash e verificação de senhas usando Scrypt
 * Configuração: N=16384, r=8, p=1, dkLen=64
 */
@Injectable()
export class PasswordService {
  private readonly N = 16384; // Fator de custo (2^14)
  private readonly r = 8; // Tamanho do bloco
  private readonly p = 1; // Fator de paralelização
  private readonly dkLen = 64; // Tamanho da chave derivada em bytes
  private readonly saltLen = 32; // Tamanho do salt em bytes

  /**
   * Gera hash da senha usando Scrypt
   * @param password Senha em texto plano
   * @returns String no formato "salt:hash" (ambos em base64)
   */
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(this.saltLen);
    const hash = (await scryptAsync(password, salt, this.dkLen)) as Buffer;

    return `${salt.toString('base64')}:${hash.toString('base64')}`;
  }

  /**
   * Verifica se a senha corresponde ao hash
   * @param password Senha em texto plano
   * @param hashedPassword Hash no formato "salt:hash"
   * @returns true se a senha corresponder, false caso contrário
   */
  async verifyPassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    try {
      const [saltBase64, hashBase64] = hashedPassword.split(':');

      if (!saltBase64 || !hashBase64) {
        return false;
      }

      const salt = Buffer.from(saltBase64, 'base64');
      const hash = (await scryptAsync(password, salt, this.dkLen)) as Buffer;

      const providedHash = Buffer.from(hashBase64, 'base64');

      return (
        hash.length === providedHash.length && hash.compare(providedHash) === 0
      );
    } catch {
      return false;
    }
  }
}
