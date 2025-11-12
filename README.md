## Running locally

1. Clone this repo
1. Install [`asdf`](https://asdf-vm.com/)
1. `asdf install`
1. Create your input list
   - format is `[first name]\t[email]`, one person per line
1. Optionally update the `not_allowed` dictionary near the top of `secretsanta.py` to prevent certain pairings (e.g., spouses)
   - disallowed pairings are `[first name]` to `[first name]`, e.g., `{ "Alex":"Sam", "Sam":"Alex" }`
1. `python secretsanta.py input_list.txt output_dir`

## Sending via Gmail

1. Create an App Password here: https://myaccount.google.com/apppasswords
1. Use `smtp.gmail.com` for SMTP server
1. Use `fulladdress@gmail.com` for from SMTP username
1. Use app password created above for password (no spaces)
