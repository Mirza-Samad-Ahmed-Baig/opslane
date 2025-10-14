-- Prove that SQLx migrations work - that's it!
CREATE TABLE _migration_test (
    id INTEGER PRIMARY KEY,
    message TEXT NOT NULL
);

INSERT INTO _migration_test (id, message) VALUES (1, 'Migrations working!');
