const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName = process.env.S3_BUCKET_NAME;
const skipS3 = !bucketName || process.env.SKIP_S3 === 'true';

let s3Client = null;
if (!skipS3) {
  try {
    s3Client = new S3Client({ region });
    console.log(`[S3 Helper] Initialized S3 client using bucket: ${bucketName}`);
  } catch (err) {
    console.warn(`[S3 Helper] Failed to initialize S3 client: ${err.message}. Using local fallback.`);
  }
} else {
  console.log('[S3 Helper] S3 Bucket not configured or SKIP_S3 set. Using local directory fallback.');
}

// Ensure local storage folder exists for local fallback
const billsDir = path.join(__dirname, '../../storage/bills');
if (!fs.existsSync(billsDir)) {
  fs.mkdirSync(billsDir, { recursive: true });
}

async function uploadBill(fileName, htmlContent) {
  if (s3Client) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: fileName,
          Body: htmlContent,
          ContentType: 'text/html'
        })
      );
      console.log(`[S3 Helper] Successfully uploaded bill ${fileName} to S3 bucket ${bucketName}`);
      return;
    } catch (err) {
      console.error(`[S3 Helper] S3 Upload failed for ${fileName} (${err.message}). Saving locally.`);
    }
  }

  // Fallback local write
  const filePath = path.join(billsDir, fileName);
  fs.writeFileSync(filePath, htmlContent, 'utf8');
  console.log(`[S3 Helper] Saved bill locally: ${filePath}`);
}

async function downloadBill(fileName, res) {
  if (s3Client) {
    try {
      const data = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: fileName
        })
      );
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      res.setHeader('Content-Type', 'text/html');
      data.Body.pipe(res);
      return;
    } catch (err) {
      console.error(`[S3 Helper] S3 GetObject failed for ${fileName} (${err.message}). Checking local disk.`);
    }
  }

  // Fallback local read
  const filePath = path.join(billsDir, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${fileName}`);
  }
  res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
  res.setHeader('Content-Type', 'text/html');
  fs.createReadStream(filePath).pipe(res);
}

module.exports = { uploadBill, downloadBill };
