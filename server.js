// server.js
require('dotenv').config();
const express   = require('express');
const http      = require('http');
const { Server }= require('socket.io');
const path      = require('path');
const connectDB = require('./config/db');

// **1. Connect to MongoDB**
connectDB();

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// **2. Express middleware**
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// **3. View engine**
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// **4. Page routes (static EJS pages)**
app.get('/',      (req, res) => res.render('home'));
app.get('/join',  (req, res) => res.render('join'));
app.get('/create',(req, res) => res.render('create'));
app.get('/rules', (req, res) => res.render('rules'));

// **5. API routes**
//    - Room creation/joining, lobby rendering
const roomRoutes = require('./routes/room');
app.use('/', roomRoutes);

//    - Game page rendering (GET /game/:code)
const gameRoutes = require('./routes/game');
app.use('/', gameRoutes);

// **6. Socket.IO handlers**
//    - Lobby events (join-room, start-game)
require('./sockets/room')(io);
//    - In-game events (join-game, play-cards, call-liar)
require('./sockets/game')(io);

// **7. Start server**
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
