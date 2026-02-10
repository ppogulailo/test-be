import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class DevLoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;
}
