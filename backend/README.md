## ClassSphere backend (MySQL)

### Setup
1. **Create MySQL database**

Run the SQL in `schema.sql` (create DB + tables).

2. **Configure env**
- Copy `backend/.env.example` to `backend/.env`
- Set `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `JWT_SECRET`

3. **Install + run**

From the `backend/` folder:

```bash
npm install
npm start
```

Server starts at `http://localhost:3000` and serves your HTML files from the project root.

### API quick notes
- **Auth**
  - `POST /api/auth/register` (multipart: `role`, `fullName`, `email`, `password`, optional `profile`)
  - `POST /api/auth/login` (`email`, `password`, optional `role`)
  - `GET /api/auth/me` (Bearer token)
- **Classrooms**
  - `GET /api/classrooms` (teacher: own classes; student: joined/pending)
  - `POST /api/classrooms` (teacher)
  - `DELETE /api/classrooms/:id` (teacher)
  - `POST /api/classrooms/join` (student: `code`, `rollId`)
  - `DELETE /api/classrooms/:id/leave` (student)
  - `GET /api/classrooms/:id/requests` (teacher)
  - `POST /api/classrooms/:id/requests/:requestId/approve` (teacher)
  - `POST /api/classrooms/:id/requests/:requestId/reject` (teacher)
  - `DELETE /api/classrooms/:id/students/:studentId` (teacher kick)

