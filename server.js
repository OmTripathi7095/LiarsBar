// server.js
require('dotenv').config();
const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const app = express();
const server = http.createServer(app);
const io     = new Server(server);

// Express config
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.render('home');   // landing page
});

app.get('/join', (req, res) => {
  res.render('join');   
});

app.get('/create', (req, res) => {
  res.render('create');
});

app.get('/rules', (req, res) => {
  res.render('rules');
});

// Socket.IO (empty for now)
io.on('connection', socket => {
  console.log('→ New client connected:', socket.id);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
