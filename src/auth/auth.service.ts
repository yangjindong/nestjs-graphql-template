import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import {
  CreateUserInput,
  LoginResult,
  LoginUserInput,
} from 'src/users/dto/user.input';
import { UsersService } from 'src/users/users.service';

import { ConfigService } from '../config/config.service';
import { User, UserDocument } from '../users/schemas/user.schema';

import { accessTokenExpiresIn } from './auth.constants';
import { JwtPayload } from './interfaces/jwt-payload.interfaces';

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUserByPassword(
    loginAttempt: LoginUserInput,
  ): Promise<LoginResult | undefined> {
    // This will be used for the initial login
    let userToAttempt: UserDocument | undefined;
    if (loginAttempt.email) {
      userToAttempt = await this.usersService.findOneByEmail(
        loginAttempt.email,
      );
    }

    // If the user is not enabled, disable log in - the token wouldn't work anyways
    if (userToAttempt && userToAttempt.enabled === false)
      userToAttempt = undefined;

    if (!userToAttempt) return undefined;

    // Check the supplied password against the hash stored for this email address
    let isMatch = false;
    try {
      isMatch = await userToAttempt.checkPassword(loginAttempt.password);
    } catch (error) {
      return undefined;
    }

    if (isMatch) {
      // If there is a successful match, generate a JWT for the user
      const token = this.createJwt(userToAttempt).token;
      const result: LoginResult = {
        user: userToAttempt,
        token,
      };
      userToAttempt.updatedAt = new Date();
      userToAttempt.save();
      return result;
    }

    return undefined;
  }

  /**
   * Verifies that the JWT payload associated with a JWT is valid by making sure the user exists and is enabled
   *
   * @param {JwtPayload} payload
   * @returns {(Promise<UserDocument | undefined>)} returns undefined if there is no user or the account is not enabled
   * @memberof {(AuthService JwtStrategy)}
   */
  async validateJwtPayload(
    payload: JwtPayload,
  ): Promise<UserDocument | undefined> {
    // This will be used when the user has already logged in and has a JWT
    const user = await this.usersService.findOneByEmail(payload.email);

    // Ensure the user exists and their account isn't disabled
    if (user && user.enabled) {
      user.updatedAt = new Date();
      user.save();
      return user;
    }

    return undefined;
  }

  createJwt(user: User): { data: JwtPayload; token: string } {
    const expiresIn = accessTokenExpiresIn;
    let expiration: Date | undefined;
    if (expiresIn) {
      expiration = new Date();
      expiration.setTime(expiration.getTime() + expiresIn * 1000);
    }
    const data: JwtPayload = {
      email: user.email,
      _id: user._id,
      expiration,
    };

    const jwt = this.jwtService.sign(data);

    return {
      data,
      token: jwt,
    };
  }

  async register(createUserInput: CreateUserInput): Promise<LoginResult> {
    const createdUser = await this.usersService.create(createUserInput);
    const result = this.createJwt(createdUser);
    return {
      user: createdUser,
      token: result.token,
    };
  }
}
