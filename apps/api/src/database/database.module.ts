import { Module } from "@nestjs/common";
import { Database } from "./database.service";

@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
