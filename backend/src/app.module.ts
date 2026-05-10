import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PatternSchema, PatternModel } from './infrastructure/repositories/schemas/pattern.schema';
import { ProgressSchema, ProgressModel } from './infrastructure/repositories/schemas/progress.schema';

import { PatternMongoRepository } from './infrastructure/repositories/pattern-mongo.repository';
import { ProgressMongoRepository } from './infrastructure/repositories/progress-mongo.repository';
import { SharpImageProcessingService } from './infrastructure/services/sharp-image-processing.service';

import { GeneratePatternUseCase } from './application/use-cases/generate-pattern.use-case';
import { GetPatternsUseCase } from './application/use-cases/get-patterns.use-case';
import { DeletePatternUseCase } from './application/use-cases/delete-pattern.use-case';
import { TrackProgressUseCase } from './application/use-cases/track-progress.use-case';
import { GetProgressUseCase } from './application/use-cases/get-progress.use-case';
import { AddProgressTimeUseCase } from './application/use-cases/add-progress-time.use-case';

import { PatternController } from './infrastructure/controllers/pattern.controller';
import { ProgressController } from './infrastructure/controllers/progress.controller';

import {
  PATTERN_REPOSITORY,
  type IPatternRepository,
} from './domain/ports/pattern.repository';
import { PROGRESS_REPOSITORY } from './domain/ports/progress.repository';
import {
  IMAGE_PROCESSING_SERVICE,
  type IImageProcessingService,
} from './domain/ports/image-processing.service';
import {
  ensureUploadsDirectory,
  getBackendConfig,
  getUploadsPath,
} from './infrastructure/config/app.config';

const backendConfig = getBackendConfig();
const uploadsPath = getUploadsPath(backendConfig);
ensureUploadsDirectory(uploadsPath);

@Module({
  imports: [
    MongooseModule.forRoot(backendConfig.mongoUri),
    MongooseModule.forFeature([
      { name: PatternModel.name, schema: PatternSchema },
      { name: ProgressModel.name, schema: ProgressSchema },
    ]),
    ServeStaticModule.forRoot({
      rootPath: uploadsPath,
      serveRoot: '/uploads',
    }),
  ],
  controllers: [AppController, PatternController, ProgressController],
  providers: [
    AppService,
    // Repositories
    { provide: PATTERN_REPOSITORY, useClass: PatternMongoRepository },
    { provide: PROGRESS_REPOSITORY, useClass: ProgressMongoRepository },
    // Services
    { provide: IMAGE_PROCESSING_SERVICE, useClass: SharpImageProcessingService },
    // Use Cases
    {
      provide: GeneratePatternUseCase,
      useFactory: (
        patternRepository: IPatternRepository,
        imageProcessingService: IImageProcessingService,
      ) =>
        new GeneratePatternUseCase(
          patternRepository,
          imageProcessingService,
          backendConfig.uploadsDir,
        ),
      inject: [PATTERN_REPOSITORY, IMAGE_PROCESSING_SERVICE],
    },
    GetPatternsUseCase,
    DeletePatternUseCase,
    TrackProgressUseCase,
    GetProgressUseCase,
    AddProgressTimeUseCase,
  ],
})
export class AppModule {}
