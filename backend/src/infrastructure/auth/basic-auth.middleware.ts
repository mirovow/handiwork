import { UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { BasicAuthConfig } from '../config/app.config';

type BasicAuthRequest = Pick<Request, 'headers' | 'method'>;
type BasicAuthResponse = Pick<Response, 'setHeader'>;

export function createBasicAuthMiddleware(credentials: BasicAuthConfig | undefined) {
  return (
    request: BasicAuthRequest,
    response: BasicAuthResponse,
    next: NextFunction,
  ): void => {
    if (credentials === undefined || request.method === 'OPTIONS') {
      next();
      return;
    }

    if (isAuthorized(request.headers.authorization, credentials)) {
      next();
      return;
    }

    response.setHeader('WWW-Authenticate', 'Basic realm="Handiwork"');
    throw new UnauthorizedException('Authentication required');
  };
}

function isAuthorized(
  authorizationHeader: string | string[] | undefined,
  credentials: BasicAuthConfig,
): boolean {
  if (typeof authorizationHeader !== 'string' || !authorizationHeader.startsWith('Basic ')) {
    return false;
  }

  const decodedCredentials = Buffer.from(authorizationHeader.slice('Basic '.length), 'base64').toString(
    'utf8',
  );
  const separatorIndex = decodedCredentials.indexOf(':');

  if (separatorIndex === -1) {
    return false;
  }

  const username = decodedCredentials.slice(0, separatorIndex);
  const password = decodedCredentials.slice(separatorIndex + 1);

  return safeEqual(username, credentials.username) && safeEqual(password, credentials.password);
}

function safeEqual(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}
