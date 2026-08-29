import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import matchRoutes from './routes/matches.js';
import chatRoutes from './routes/chat.js';
import { authenticateToken } from './middleware/authMiddleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/matches', authenticateToken, matchRoutes);
app.use('/api/chat', authenticateToken, chatRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io real-time chat & status logic
const onlineUsers = new Map(); // userId -> socketId

io.use((socket, next) => {
  const userId = socket.handshake.auth.userId;
  if (!userId) {
    return next(new Error('Authentication error'));
  }
  socket.userId = Number(userId);
  next();
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  onlineUsers.set(userId, socket.id);
  io.emit('user_status', { userId, status: 'online' });

  socket.on('join_room', ({ matchId }) => {
    socket.join(`match_${matchId}`);
  });

  socket.on('send_message', ({ matchId, recipientId, content }) => {
    const timestamp = new Date().toISOString();

    // Save to DB
    db.run(
      `INSERT INTO messages (match_id, sender_id, recipient_id, content, created_at) VALUES (?, ?, ?, ?, ?)`,
      [matchId, userId, recipientId, content],
      function (err) {
        if (err) {
          console.error('Database error saving message:', err);
          return;
        }

        const messageData = {
          id: this.lastID,
          match_id: matchId,
          sender_id: userId,
          recipient_id: recipientId,
          content,
          created_at: timestamp
        };

        // Emit to room
        io.to(`match_${matchId}`).emit('receive_message', messageData);

        // Also emit notification to recipient if online
        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('message_notification', messageData);
        }
      }
    );
  });

  socket.on('typing', ({ matchId, isTyping }) => {
    socket.to(`match_${matchId}`).emit('user_typing', { userId, isTyping });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    io.emit('user_status', { userId, status: 'offline' });
  });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export { app, server, io };
