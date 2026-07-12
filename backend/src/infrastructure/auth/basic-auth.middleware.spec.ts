import { Controller, Get, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createBasicAuthMiddleware } from './basic-auth.middleware';

@Controller()
class TestController {
  @Get()
  get() {
    return 'ok';
  }
}

describe('basic auth middleware', () => {
  const next = jest.fn();
  const response = {
    setHeader: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows requests when basic auth is disabled', () => {
    const middleware = createBasicAuthMiddleware(undefined);

    middleware({ headers: {} }, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('allows requests with matching basic auth credentials', () => {
    const middleware = createBasicAuthMiddleware({
      username: 'admin',
      password: 'secret',
    });

    middleware(
      {
        headers: {
          authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`,
        },
      },
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('rejects requests without basic auth credentials', () => {
    const middleware = createBasicAuthMiddleware({
      username: 'admin',
      password: 'secret',
    });

    expect(() => middleware({ headers: {} }, response, next)).toThrow(
      UnauthorizedException,
    );
    expect(next).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="Handiwork"',
    );
  });

  it('rejects requests with incorrect basic auth credentials', () => {
    const middleware = createBasicAuthMiddleware({
      username: 'admin',
      password: 'secret',
    });

    expect(() =>
      middleware(
        {
          headers: {
            authorization: `Basic ${Buffer.from('admin:wrong').toString('base64')}`,
          },
        },
        response,
        next,
      ),
    ).toThrow(UnauthorizedException);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a basic auth challenge in a Nest app', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();

    app.use(
      createBasicAuthMiddleware({
        username: 'admin',
        password: 'secret',
      }),
    );
    await app.init();

    try {
      await request(app.getHttpServer())
        .get('/')
        .expect(401)
        .expect('WWW-Authenticate', 'Basic realm="Handiwork"');
    } finally {
      await app.close();
    }
  });
});
