const express = require('express');
const cors = require('cors');
const analyzeRoute = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());
app.use('/analyze', analyzeRoute);

app.listen(PORT, () => {
  console.log(`WebIntel backend running on port ${PORT}`);
});

