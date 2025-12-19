-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "locale" TEXT,
    "imageSourceType" TEXT,
    "imageSource" TEXT,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conditionA" TEXT NOT NULL,
    "conditionB" TEXT NOT NULL,
    "conditionC" TEXT NOT NULL,
    "ratingStyleComprehension" INTEGER,
    "ratingEmotionalFit" INTEGER,
    "ratingEnjoyment" INTEGER,
    "freeText" TEXT,
    CONSTRAINT "Trial_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
