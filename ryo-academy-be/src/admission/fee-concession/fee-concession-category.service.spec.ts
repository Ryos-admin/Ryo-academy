import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { FeeConcessionCategoryService } from "./fee-concession-category.service.js";
import { DatabaseService } from "../../database/database.service.js";

describe("FeeConcessionCategoryService", () => {
  let service: FeeConcessionCategoryService;
  let db: any;

  beforeEach(() => {
    db = {
      user: {
        findUnique: jest.fn(),
      },
      school: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      feeConcessionCategory: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new FeeConcessionCategoryService(db as unknown as DatabaseService);
  });

  describe("create", () => {
    it("creates a new concession category with normalized uppercase code", async () => {
      db.user.findUnique.mockResolvedValue({ schoolId: "school-1" });
      db.feeConcessionCategory.findFirst.mockResolvedValue(null);
      db.feeConcessionCategory.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: "cat-1", ...data }),
      );

      const result = await service.create(
        {
          name: "Sibling Concession",
          code: "sibling",
          description: "For second child",
        },
        "user-1",
      );

      expect(result.code).toBe("SIBLING");
      expect(result.schoolId).toBe("school-1");
      expect(result.isActive).toBe(true);
      expect(db.feeConcessionCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: "SIBLING",
            name: "Sibling Concession",
            schoolId: "school-1",
          }),
        }),
      );
    });

    it("rejects duplicate category code within same school (ConflictException)", async () => {
      db.user.findUnique.mockResolvedValue({ schoolId: "school-1" });
      db.feeConcessionCategory.findFirst.mockResolvedValue({
        id: "existing-cat",
        code: "SIBLING",
        schoolId: "school-1",
      });

      await expect(
        service.create(
          { name: "Duplicate Sibling", code: "SIBLING" },
          "user-1",
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects cross-school creation when user belongs to different school (ForbiddenException)", async () => {
      db.user.findUnique.mockResolvedValue({ schoolId: "school-1" });

      await expect(
        service.create(
          { name: "Sibling", code: "SIBLING", schoolId: "school-2" },
          "user-1",
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("findAll", () => {
    it("returns active categories for the actor's school by default", async () => {
      db.user.findUnique.mockResolvedValue({ schoolId: "school-1" });
      const categories = [
        { id: "cat-1", name: "Merit", code: "MERIT", isActive: true },
      ];
      db.feeConcessionCategory.findMany.mockResolvedValue(categories);

      const result = await service.findAll("user-1");
      expect(result).toEqual(categories);
      expect(db.feeConcessionCategory.findMany).toHaveBeenCalledWith({
        where: {
          schoolId: "school-1",
          isActive: true,
          deletedAt: null,
        },
        orderBy: { name: "asc" },
      });
    });

    it("includes inactive categories when includeInactive=true", async () => {
      db.user.findUnique.mockResolvedValue({ schoolId: "school-1" });
      db.feeConcessionCategory.findMany.mockResolvedValue([]);

      await service.findAll("user-1", undefined, true);
      expect(db.feeConcessionCategory.findMany).toHaveBeenCalledWith({
        where: {
          schoolId: "school-1",
          deletedAt: null,
        },
        orderBy: { name: "asc" },
      });
    });
  });

  describe("delete (soft deactivation)", () => {
    it("soft-deactivates the category preserving historical records", async () => {
      db.user.findUnique.mockResolvedValue({ schoolId: "school-1" });
      db.feeConcessionCategory.findFirst.mockResolvedValue({
        id: "cat-1",
        schoolId: "school-1",
      });
      db.feeConcessionCategory.update.mockResolvedValue({
        id: "cat-1",
        isActive: false,
      });

      const result = await service.delete("cat-1", "user-1");
      expect(result.isActive).toBe(false);
      expect(db.feeConcessionCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cat-1" },
          data: expect.objectContaining({
            isActive: false,
            deletedById: "user-1",
          }),
        }),
      );
    });
  });
});
