export default function handler(req, res) {
  console.log("Received callback:", req.query);
  res.status(200).json({ status: 'ok' });
}