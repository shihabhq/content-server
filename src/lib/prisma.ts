import "dotenv/config";
import { PrismaClient } from "../../prisma/generated/client.js";

const prisma = new PrismaClient({
  accelerateUrl: process.env.DATABASE_URL!
});

export default prisma;
