import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface BucketConfig {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region?: string; // e.g. "us-east-1" for MinIO, "auto" for Railway/R2
  publicUrl?: string; // For public assets, if any
}

export class BucketClient {
  private client: S3Client;
  private bucketName: string;

  constructor(config: BucketConfig) {
    this.client = new S3Client({
      region: config.region ?? "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // Required for path-style access with MinIO
      forcePathStyle: true,
    });
    this.bucketName = config.bucketName;
  }

  async upload(
    key: string,
    body: Buffer | Uint8Array | Blob | string,
    contentType?: string,
  ) {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    return this.client.send(command);
  }

  async delete(key: string) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return this.client.send(command);
  }

  async getSignedUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async list(prefix?: string) {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    return this.client.send(command);
  }
}
