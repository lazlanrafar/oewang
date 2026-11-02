//! Where file bytes live.
//!
//! One trait, two implementations: the local filesystem in development and
//! an S3-compatible service in production (D19). Keeping development free
//! of cloud credentials is the point.
//!
//! A file is stored as its chunks, one object per chunk, because that is
//! also how it is uploaded and how it is served back (D23). Nothing ever
//! assembles the whole file on disk or in memory except the hash at
//! completion.

use std::future::Future;

mod local;
mod s3;

pub use local::LocalStorage;
pub use s3::{S3Config, S3Storage};

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("object not found")]
    NotFound,
    #[error("storage unavailable: {0}")]
    Unavailable(String),
}

pub type StorageResult<T> = Result<T, StorageError>;

/// Read and write object bytes.
///
/// No method takes a filename and no method returns a URL. A key is built
/// by the caller from ids it generated (SEC-13), and bytes come back
/// through the API rather than through a signed link (D23, VLT-3).
pub trait Storage {
    fn put(&self, key: &str, bytes: &[u8]) -> impl Future<Output = StorageResult<()>> + Send;
    fn get(&self, key: &str) -> impl Future<Output = StorageResult<Vec<u8>>> + Send;
    fn delete(&self, key: &str) -> impl Future<Output = StorageResult<()>> + Send;
}

/// Which backend is configured.
///
/// An enum rather than a `dyn Storage`: an async method in a trait is not
/// object safe, there are exactly two implementations, and a third would
/// be a line here rather than a redesign.
#[derive(Debug, Clone)]
pub enum FileStore {
    Local(LocalStorage),
    S3(S3Storage),
}

impl Storage for FileStore {
    async fn put(&self, key: &str, bytes: &[u8]) -> StorageResult<()> {
        match self {
            FileStore::Local(backend) => backend.put(key, bytes).await,
            FileStore::S3(backend) => backend.put(key, bytes).await,
        }
    }

    async fn get(&self, key: &str) -> StorageResult<Vec<u8>> {
        match self {
            FileStore::Local(backend) => backend.get(key).await,
            FileStore::S3(backend) => backend.get(key).await,
        }
    }

    async fn delete(&self, key: &str) -> StorageResult<()> {
        match self {
            FileStore::Local(backend) => backend.delete(key).await,
            FileStore::S3(backend) => backend.delete(key).await,
        }
    }
}

/// The key one chunk of a file is stored under.
///
/// Derived from ids the API generated, never from anything a client sent.
/// One object per chunk, because that is how a chunk is uploaded and how
/// it is served back.
pub fn chunk_key(file_key: &str, index: u32) -> String {
    format!("{file_key}/{index:05}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_pad_a_chunk_index_so_keys_sort() {
        assert_eq!(chunk_key("wsp/w1/f1", 0), "wsp/w1/f1/00000");
        assert_eq!(chunk_key("wsp/w1/f1", 19), "wsp/w1/f1/00019");
    }
}
