import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsIn } from 'class-validator';

export class SignUpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'at-least-8-chars', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;

  @ApiProperty({ example: 'client', enum: ['client', 'candidate'] })
  @IsIn(['client', 'candidate'], {
    message: 'Role must be either client or candidate',
  })
  role!: 'client' | 'candidate';
}
