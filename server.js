const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Configuración de multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

// Middleware
app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas estáticas
app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});

app.get('/script.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'script.js'));
});

// Inicializar base de datos
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libros (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        autor TEXT NOT NULL,
        año INTEGER,
        genero TEXT,
        idioma TEXT,
        archivo_nombre TEXT,
        pdf_data BYTEA,
        pdf_tipo TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tabla libros inicializada correctamente');
  } catch (err) {
    console.error('Error al inicializar la base de datos:', err);
  }
}

initializeDatabase();

// Ruta para descargar PDF 
app.get('/descargar-pdf/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT archivo_nombre, pdf_data, pdf_tipo FROM libros WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0 || !result.rows[0].pdf_data) {
      return res.status(404).send('PDF no encontrado');
    }
    
    const row = result.rows[0];
    
    res.setHeader('Content-Type', row.pdf_tipo || 'application/pdf');
    res.setHeader('Content-Disposition', attachment; filename="${row.archivo_nombre || 'documento.pdf'}");
    res.send(row.pdf_data);
  } catch (err) {
    console.error('Error al obtener PDF:', err);
    res.status(500).send('Error del servidor');
  }
});

// Ruta para ver PDF 
app.get('/ver-pdf/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT archivo_nombre, pdf_data, pdf_tipo FROM libros WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0 || !result.rows[0].pdf_data) {
      return res.status(404).send('PDF no encontrado');
    }
    
    const row = result.rows[0];
    
    res.setHeader('Content-Type', row.pdf_tipo || 'application/pdf');
    res.setHeader('Content-Disposition', inline; filename="${row.archivo_nombre || 'documento.pdf'}");
    res.send(row.pdf_data);
  } catch (err) {
    console.error('Error al obtener PDF:', err);
    res.status(500).send('Error del servidor');
  }
});

// API Routes
app.get('/api/libros', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  try {
    let query = 'SELECT id, titulo, autor, año, genero, idioma, archivo_nombre FROM libros';
    let countQuery = 'SELECT COUNT(*) as total FROM libros';
    let params = [];
    let paramCount = 0;

    if (search) {
      query += ' WHERE titulo ILIKE $1 OR autor ILIKE $2 OR genero ILIKE $3 OR idioma ILIKE $4';
      countQuery += ' WHERE titulo ILIKE $1 OR autor ILIKE $2 OR genero ILIKE $3 OR idioma ILIKE $4';
      params = [%${search}%, %${search}%, %${search}%, %${search}%];
      paramCount = 4;
    }

    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    
    // Obtener total
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);
    
    // Obtener libros
    const result = await pool.query(query, [...params, limit, offset]);
    
    res.json({
      libros: result.rows,
      total: total,
      page: page,
      limit: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error al obtener libros:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener un libro por ID
app.get('/api/libros/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT id, titulo, autor, año, genero, idioma, archivo_nombre FROM libros WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al obtener libro:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Agregar un nuevo libro
app.post('/api/libros', upload.single('archivo_pdf'), async (req, res) => {
  const { titulo, autor, año, genero, idioma } = req.body;
  
  let archivo_nombre = null;
  let pdf_data = null;
  let pdf_tipo = null;

  if (req.file) {
    archivo_nombre = req.file.originalname;
    pdf_data = req.file.buffer;
    pdf_tipo = req.file.mimetype;
  }

  try {
    const result = await pool.query(
      'INSERT INTO libros (titulo, autor, año, genero, idioma, archivo_nombre, pdf_data, pdf_tipo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
      [titulo, autor, año, genero, idioma, archivo_nombre, pdf_data, pdf_tipo]
    );
    
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error('Error al insertar libro:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar un libro
app.put('/api/libros/:id', upload.single('archivo_pdf'), async (req, res) => {
  const { id } = req.params;
  const { titulo, autor, año, genero, idioma } = req.body;
  
  try {
    // Si se subió un nuevo archivo
    if (req.file) {
      const archivo_nombre = req.file.originalname;
      const pdf_data = req.file.buffer;
      const pdf_tipo = req.file.mimetype;
      
      await pool.query(
        'UPDATE libros SET titulo = $1, autor = $2, año = $3, genero = $4, idioma = $5, archivo_nombre = $6, pdf_data = $7, pdf_tipo = $8 WHERE id = $9',
        [titulo, autor, año, genero, idioma, archivo_nombre, pdf_data, pdf_tipo, id]
      );
    } else {
      await pool.query(
        'UPDATE libros SET titulo = $1, autor = $2, año = $3, genero = $4, idioma = $5 WHERE id = $6',
        [titulo, autor, año, genero, idioma, id]
      );
    }
    
    res.json({ changes: 1 });
  } catch (err) {
    console.error('Error al actualizar libro:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar un libro
app.delete('/api/libros/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM libros WHERE id = $1', [id]);
    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('Error al eliminar libro:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Ruta de prueba para verificar conexión a BD
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    res.json({ 
      message: 'Conexión a PostgreSQL exitosa',
      currentTime: result.rows[0].current_time,
      database: process.env.DATABASE_URL ? 'Configurada' : 'No configurada'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Manejo de errores
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo es demasiado grande. Máximo 10MB.' });
    }
  }
  res.status(400).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(Servidor ejecutándose en puerto ${PORT});
  console.log(Entorno: ${process.env.NODE_ENV || 'development'});
});
