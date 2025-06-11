-- Grant CREATE, ALTER, DROP, and REFERENCES privileges on all databases and tables
-- to 'test_user' from 'localhost'.
-- This is suitable for development environments where the user needs
-- to manage database schemas for tools like Prisma Migrate.
GRANT CREATE, ALTER, DROP, REFERENCES ON *.* TO 'test_user'@'localhost';

-- It's generally good practice to explicitly define a password for the user,
-- especially if it's not already set. If the user 'test_user' doesn't exist,
-- you'll need to create them first.
-- Example of creating a user (if 'test_user' doesn't exist):
-- CREATE USER 'test_user'@'localhost' IDENTIFIED BY 'your_chosen_password';

-- If you also need the user to be able to grant these permissions to other users
-- (which is often needed for root or administrative users, but less common for app users),
-- you would add WITH GRANT OPTION:
-- GRANT CREATE, ALTER, DROP, REFERENCES ON *.* TO 'test_user'@'localhost' WITH GRANT OPTION;

FLUSH PRIVILEGES;
EXIT;
