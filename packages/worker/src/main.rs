use std::env::VarError;
use std::path::PathBuf;

use qcos::objects::mime;
use qcos::client::Client;
use qcos::request::ErrNo;


#[tokio::main]
async fn main() {
    dotenv::from_filename(".env.local").ok();

    if let Ok(client) = init_cos() {
      let res = client.put_object(
        &PathBuf::from("Cargo.toml"),
        "Cargo.toml",
        Some(mime::TEXT_PLAIN_UTF_8),
        None,
      ).await;

      if res.error_no == ErrNo::SUCCESS {
        println!("put object success");
      } else {
        println!("put object failed, [{}]: {}", res.error_no, res.error_message);
      }
    } else {
      panic!("init cos failed");
    }
}

fn init_cos() -> Result<Client, VarError> {
    let secrect_id = std::env::var("SECRECT_ID")?;
    let secrect_key = std::env::var("SECRECT_KEY")?;
    let bucket = std::env::var("BUCKET")?;
    let region = std::env::var("REGION")?;


    let client = Client::new(
        secrect_id,
        secrect_key,
        bucket,
        region,
    );

    Ok(client)
}

