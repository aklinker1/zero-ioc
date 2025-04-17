import { describe, it, expect, mock } from "bun:test";
import { parameterize, createIocContainer } from "..";

describe("IoC Container", () => {
  it("should construct a dependency tree", () => {
    const expected = ["one", "two"];

    const openDatabase = () => ({
      query: () => expected,
    });
    type Database = ReturnType<typeof openDatabase>;

    const createUserRepo = (deps: { db: Database }) => ({
      list: () => deps.db.query(),
    });

    const container = createIocContainer()
      .register({ db: openDatabase })
      .register({ userRepo: createUserRepo });

    const userRepo = container.resolve("userRepo");
    const actual = userRepo.list();

    expect(actual).toEqual(expected);
  });

  it("should only create a single instance of a service", () => {
    const openDatabase = mock(() => ({
      query: (from: string) => ["one", "two", from],
    }));
    type Database = ReturnType<typeof openDatabase>;

    const createUserRepo = mock((deps: { db: Database }) => ({
      list: () => deps.db.query("user"),
    }));
    const createDocumentRepo = mock((deps: { db: Database }) => ({
      list: () => deps.db.query("document"),
    }));

    const container = createIocContainer()
      .register({ db: openDatabase })
      .register({
        userRepo: createUserRepo,
        documentRepo: createDocumentRepo,
      });

    const _userRepo1 = container.resolve("userRepo");
    const _documentsRepo1 = container.resolve("documentRepo");
    const _db = container.resolve("db");
    const _userRepo2 = container.resolve("userRepo");
    const _documentsRepo2 = container.resolve("documentRepo");

    expect(createUserRepo).toBeCalledTimes(1);
    expect(createDocumentRepo).toBeCalledTimes(1);
    expect(openDatabase).toBeCalledTimes(1);
  });

  it("should support classes and factory functions", () => {
    class Database {
      query(from: string) {
        return ["one", "two", from];
      }
    }

    class UserRepo {
      constructor(private deps: { db: Database }) {}

      list() {
        return this.deps.db.query("user");
      }
    }

    const createDocumentRepo = (deps: { db: Database }) => ({
      list: () => deps.db.query("document"),
    });

    const container = createIocContainer()
      .register({ db: Database })
      .register({ userRepo: UserRepo, documentRepo: createDocumentRepo });
    const userRepo = container.resolve("userRepo");
    const documentRepo = container.resolve("documentRepo");

    expect(userRepo.list()).toEqual(["one", "two", "user"]);
    expect(documentRepo.list()).toEqual(["one", "two", "document"]);
  });

  it("should support building factories with parameterization", () => {
    class Database {
      constructor(private deps: { param: string }) {}

      query(from: string) {
        return ["one", "two", from, this.deps.param];
      }
    }

    const createUserRepo = (deps: { db: Database; id: number }) => ({
      list: () => deps.db.query("user" + deps.id),
    });
    const createDocumentRepo = (deps: { db: Database }) => ({
      list: () => deps.db.query("document"),
    });

    const container = createIocContainer()
      .register({
        db: parameterize(Database, {
          param: "test",
        }),
      })
      .register({
        userRepo: parameterize(createUserRepo, {
          id: 3,
        }),
        documentRepo: createDocumentRepo,
      });
    const userRepo = container.resolve("userRepo");
    const documentRepo = container.resolve("documentRepo");

    expect(userRepo.list()).toEqual(["one", "two", "user3", "test"]);
    expect(documentRepo.list()).toEqual(["one", "two", "document", "test"]);
  });

  it("should provide get access to all registered services", () => {
    class Database {}
    class UserRepo {
      constructor(private deps: { db: Database }) {}
    }
    class DocumentRepo {
      constructor(private deps: { db: Database }) {}
    }

    const container = createIocContainer()
      .register({
        db: Database,
      })
      .register({
        userRepo: UserRepo,
        documentRepo: DocumentRepo,
      });

    expect(container.registrations.db).toBeInstanceOf(Database);
    expect(container.registrations.userRepo).toBeInstanceOf(UserRepo);
    expect(container.registrations.documentRepo).toBeInstanceOf(DocumentRepo);

    // @ts-expect-error: Purposefully accessing a non-existent service
    expect(() => container.registrations.other).toThrow(
      'Service "other" not found',
    );
  });
});
