import { Test, TestingModule } from '@nestjs/testing';
import { PasswordService } from './password.service';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  describe('hashPassword', () => {
    it('deve gerar hash da senha no formato correto', async () => {
      const password = 'senha123';
      const hashedPassword = await service.hashPassword(password);

      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
      expect(hashedPassword).toContain(':');
      
      const [salt, hash] = hashedPassword.split(':');
      expect(salt).toBeDefined();
      expect(hash).toBeDefined();
      
      // Verifica que são base64 válidos
      expect(() => Buffer.from(salt, 'base64')).not.toThrow();
      expect(() => Buffer.from(hash, 'base64')).not.toThrow();
    });

    it('deve gerar hashes diferentes para a mesma senha', async () => {
      const password = 'senha123';
      const hash1 = await service.hashPassword(password);
      const hash2 = await service.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('deve gerar hash com salt de 32 bytes', async () => {
      const password = 'senha123';
      const hashedPassword = await service.hashPassword(password);
      const [salt] = hashedPassword.split(':');
      const saltBuffer = Buffer.from(salt, 'base64');

      expect(saltBuffer.length).toBe(32);
    });

    it('deve gerar hash de 64 bytes', async () => {
      const password = 'senha123';
      const hashedPassword = await service.hashPassword(password);
      const [, hash] = hashedPassword.split(':');
      const hashBuffer = Buffer.from(hash, 'base64');

      expect(hashBuffer.length).toBe(64);
    });
  });

  describe('verifyPassword', () => {
    it('deve verificar corretamente uma senha válida', async () => {
      const password = 'senha123';
      const hashedPassword = await service.hashPassword(password);
      const isValid = await service.verifyPassword(password, hashedPassword);

      expect(isValid).toBe(true);
    });

    it('deve rejeitar senha incorreta', async () => {
      const password = 'senha123';
      const wrongPassword = 'senha456';
      const hashedPassword = await service.hashPassword(password);
      const isValid = await service.verifyPassword(wrongPassword, hashedPassword);

      expect(isValid).toBe(false);
    });

    it('deve rejeitar hash malformado (sem dois pontos)', async () => {
      const password = 'senha123';
      const invalidHash = 'hashmalformado';
      const isValid = await service.verifyPassword(password, invalidHash);

      expect(isValid).toBe(false);
    });

    it('deve rejeitar hash malformado (sem salt)', async () => {
      const password = 'senha123';
      const invalidHash = ':hash';
      const isValid = await service.verifyPassword(password, invalidHash);

      expect(isValid).toBe(false);
    });

    it('deve rejeitar hash malformado (sem hash)', async () => {
      const password = 'senha123';
      const invalidHash = 'salt:';
      const isValid = await service.verifyPassword(password, invalidHash);

      expect(isValid).toBe(false);
    });

    it('deve rejeitar hash com base64 inválido', async () => {
      const password = 'senha123';
      const invalidHash = 'salt-invalido:hash-invalido';
      const isValid = await service.verifyPassword(password, invalidHash);

      expect(isValid).toBe(false);
    });

    it('deve verificar corretamente múltiplas senhas diferentes', async () => {
      const passwords = ['senha1', 'senha2', 'senha3'];
      
      for (const password of passwords) {
        const hashedPassword = await service.hashPassword(password);
        const isValid = await service.verifyPassword(password, hashedPassword);
        expect(isValid).toBe(true);
      }
    });

    it('deve usar os parâmetros corretos do Scrypt', async () => {
      const password = 'senha123';
      const hashedPassword = await service.hashPassword(password);
      const [saltBase64] = hashedPassword.split(':');
      const salt = Buffer.from(saltBase64, 'base64');

      // Verifica que o hash foi gerado com os parâmetros corretos
      const expectedHash = (await scryptAsync(password, salt, 64)) as Buffer;
      const [, hashBase64] = hashedPassword.split(':');
      const actualHash = Buffer.from(hashBase64, 'base64');

      expect(actualHash.length).toBe(expectedHash.length);
      expect(actualHash.compare(expectedHash)).toBe(0);
    });
  });
});
