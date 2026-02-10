import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class SignUpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'at-least-8-chars', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;
}
