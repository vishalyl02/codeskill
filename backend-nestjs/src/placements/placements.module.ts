import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Placement } from './placement.entity';
import { PlacementsService } from './placements.service';
import { PlacementsController } from './placements.controller';
@Module({
  imports: [TypeOrmModule.forFeature([Placement])],
  controllers: [PlacementsController],
  providers: [PlacementsService],
})
export class PlacementsModule {}
