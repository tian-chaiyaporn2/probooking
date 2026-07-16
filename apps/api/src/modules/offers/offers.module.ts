import { Module } from "@nestjs/common";
import { OffersService } from "./offers.service.js";

@Module({ providers: [OffersService], exports: [OffersService] })
export class OffersModule {}
