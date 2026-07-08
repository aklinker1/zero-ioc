import { describe, expect, it, mock } from "bun:test";
import { createIocContainer, parameterize, transient } from "..";
import { createContainer } from "awilix";

describe("IoC Container", () => {
  it("should construct a dependency tree", () => {
    const expected = ["one", "two"];

    type Database = {
      query: () => string[];
    };
    const openDatabase = (): Database => ({
      query: () => expected,
    });

    type Repo = {
      list: () => string[];
    };
    const createUserRepo = (deps: { db: Database }): Repo => {
      return {
        list: () => deps.db.query(),
      };
    };

    const container = createIocContainer()
      .register({ db: openDatabase })
      .register({ userRepo: createUserRepo });

    container.resolve("db").query();

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

  it("should create multiple instances of transient services", () => {
    const openDatabase = mock(() => ({
      query: (from: string) => ["one", "two", from],
    }));
    type Database = ReturnType<typeof openDatabase>;

    const createUserRepo = mock((deps: { db: Database }) => ({
      list: () => deps.db.query("user"),
    }));

    const container = createIocContainer()
      .register("db", openDatabase)
      .register("userRepo", transient(createUserRepo));

    const db1 = container.resolve("db");
    const db2 = container.resolve("db");
    const userRepo1 = container.resolve("userRepo");
    const userRepo2 = container.resolve("userRepo");

    expect(openDatabase).toBeCalledTimes(1);
    expect(createUserRepo).toBeCalledTimes(2);
    expect(db1).toBe(db2);
    expect(userRepo1).not.toBe(userRepo2);
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

    type Repo = {
      list: () => string[];
    };
    const createUserRepo = (deps: { db: Database; id: number }): Repo => ({
      list: () => deps.db.query("user" + deps.id),
    });
    const createDocumentRepo = (deps: { db: Database }): Repo => ({
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
    type Database = {};
    const openDatabase = (): Database => ({});

    class UserRepo {
      constructor(private deps: { db: Database }) {}
    }
    class DocumentRepo {
      constructor(private deps: { db: Database }) {}
    }

    const container = createIocContainer()
      .register({
        db: openDatabase,
      })
      .register({
        userRepo: UserRepo,
        documentRepo: DocumentRepo,
      });

    expect(container.registrations.db).toBeDefined();
    expect(container.registrations.userRepo).toBeInstanceOf(UserRepo);
    expect(container.registrations.documentRepo).toBeInstanceOf(DocumentRepo);
    // @ts-expect-error: Purposefully accessing a non-existent service
    expect(() => container.registrations.other).toThrow(
      'Service "other" not found',
    );
  });

  it("should resolve all registered services", () => {
    type Database = {};
    const openDatabase = (): Database => ({});

    class UserRepo {
      constructor(private deps: { db: Database }) {}
    }
    class DocumentRepo {
      constructor(private deps: { db: Database }) {}
    }

    const services = createIocContainer()
      .register({
        db: openDatabase,
      })
      .register({
        userRepo: UserRepo,
        documentRepo: DocumentRepo,
      })
      .resolveAll();

    expect(services.db).toBeDefined();
    expect(services.userRepo).toBeInstanceOf(UserRepo);
    expect(services.documentRepo).toBeInstanceOf(DocumentRepo);
    // @ts-expect-error: Purposefully accessing a non-existent service
    expect(services.other).toBeUndefined();
  });

  describe("scopes", () => {
    it("should resolve scope and container dependencies when a service is resolved", () => {
      const a = "a";
      const b = "b";
      const c = ({ a, b }: { a: string; b: string }) => ({ a, b });

      const parent = createIocContainer().register("a", () => a);

      const scope = parent.scope<{ b: "b" }>().register("c", c);
      const scoped = scope({ b });

      expect(scoped.resolve("a")).toBe(a);
      expect(scoped.resolve("b")).toBe(b);
      expect(scoped.resolve("c")).toEqual({ a, b });
    });

    it("should recreate services registered to the scope for each time it is created", () => {
      const a = "a";
      const createA = mock(() => a);
      const createC = mock(({ a, b }: { a: string; b: string }) => ({ a, b }));
      const container = createIocContainer().register("a", createA);
      const scope = container.scope<{ b: string }>().register("c", createC);

      const scoped1 = scope({ b: "b1" });
      const scoped2 = scope({ b: "b2" });

      const deps1 = scoped1.resolveAll();
      const deps2 = scoped2.resolveAll();

      expect(deps1).toEqual({ a, b: "b1", c: { a, b: "b1" } });
      expect(deps2).toEqual({ a, b: "b2", c: { a, b: "b2" } });

      expect(createA).toBeCalledTimes(1);
      expect(createC).toBeCalledTimes(2);
    });
  });
});
