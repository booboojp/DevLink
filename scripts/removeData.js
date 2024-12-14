const sqlite3 = require('sqlite3').verbose();
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const db = new sqlite3.Database('./project/server/users.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    console.log('Connected to database.');
});

function cleanDevData() {
    rl.question('This will delete all personal info and chat data. Continue? (y/n): ', (answer) => {
        if (answer.toLowerCase() === 'y') {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                try {
                    db.run('DELETE FROM personal_info', [], (err) => {
                        if (err) throw err;
                        console.log('✓ Cleared personal_info table');
                    });

                    db.run('DELETE FROM chat_messages', [], (err) => {
                        if (err) throw err;
                        console.log('✓ Cleared chat_messages table');
                    });

                    db.run('DELETE FROM chat_rooms', [], (err) => {
                        if (err) throw err;
                        console.log('✓ Cleared chat_rooms table');
                    });

                    db.run('DELETE FROM user_connections', [], (err) => {
                        if (err) throw err;
                        console.log('✓ Cleared user_connections table');
                    });

                    db.run('COMMIT', [], (err) => {
                        if (err) throw err;
                        console.log('✓ All development data cleared successfully');
                        console.log('✓ GitHub user data preserved');
                        closeConnection();
                    });

                } catch (error) {
                    db.run('ROLLBACK');
                    console.error('Error cleaning data:', error);
                    closeConnection();
                }
            });
        } else {
            console.log('Operation cancelled.');
            closeConnection();
        }
    });
}

function closeConnection() {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        rl.close();
    });
}

cleanDevData();