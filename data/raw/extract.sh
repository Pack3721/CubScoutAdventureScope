#!/bin/bash

# Exit immediately if the user presses Ctrl+C
trap "echo -e '\nScript aborted by user.'; exit 1" SIGINT

# Configuration
START_URL="https://www.scouting.org/programs/cub-scouts/adventures/"
OUTPUT_DIR="./output"
USER_AGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.10 Safari/605.1.1"
FM_MODEL="pcc"

check_html_for_bad_response() {
    TEST_FILE="$1"
    if grep -q "Your access to this site has been limited by the site owner" "$TEST_FILE"; then
        echo "Error: Detected access limitation message in HTML response. Please check if the site is blocking requests."
        cat "$TEST_FILE" # Output the HTML content for debugging
        curl ifconfig.me # Output the current IP address for debugging
        rm "$TEST_FILE"
        kill -15 $$ # Gracefully terminate the script
        exit 1
    fi
}

# Create output directory if it does not exist
mkdir -p "$OUTPUT_DIR"

echo "Starting data extraction from $START_URL"

# 1. Start with initial URL
OUTPUT_RAW_INITIAL_PAGE="$OUTPUT_DIR/raw_initial_page.txt"
if [ -f "$OUTPUT_RAW_INITIAL_PAGE" ]; then
    echo "Initial page data already exists. Skipping fetch."
    HTML_DATA=$(cat "$OUTPUT_RAW_INITIAL_PAGE")
else
    echo "Fetching initial page data..."

    HTML_DATA=$(curl -A "$USER_AGENT" -s "$START_URL" | html2text -links)

    echo "$HTML_DATA" > "$OUTPUT_RAW_INITIAL_PAGE"
fi

check_html_for_bad_response "$OUTPUT_RAW_INITIAL_PAGE"


# 2. First Pass: Fetch ranks JSON and save it
OUTPUT_RANKS_JSON="$OUTPUT_DIR/raw_ranks.json"
if [ -f "$OUTPUT_RANKS_JSON" ]; then
    echo "Ranks JSON already exists. Skipping extraction."
    RANKS_JSON=$(cat "$OUTPUT_RANKS_JSON")
else
    echo "Extracting ranks JSON..."
    RANKS_JSON=$(fm respond --schema ./schema/rank_schema.json \
    --model "$FM_MODEL" \
    --instructions "find each of the cubscout ranks and their corresponding full urls" \
    --text "$START_URL => $HTML_DATA")

    # Save raw ranks JSON
    echo "$RANKS_JSON" > "$OUTPUT_RANKS_JSON"
fi

# Process ranks JSON
# object with a Ranks Property that is an array of objects with name and url properties
echo "$RANKS_JSON" | jq -r '.Ranks[] | "\(.name)\t\(.url)"' | while IFS=$'\t' read -r NAME URL; do
 
 # Sanitize NAME for file naming
SAFE_NAME=$(echo "$NAME" | tr -cd 'A-Za-z0-9_-')
FILE_PATH="$OUTPUT_DIR/FINAL_${SAFE_NAME}.md"


printf "# %s [🔗](%s)\n\n" "$NAME" "$URL" > "$FILE_PATH"

echo "Processing rank: $NAME with URL: $URL"
 # 3. Second Pass: Fetch nested URL and pass as an argument to the second command
OUTPUT_RAW_SUB_PAGE="$OUTPUT_DIR/raw_sub_page_${SAFE_NAME}.txt"
if [ -f "$OUTPUT_RAW_SUB_PAGE" ]; then
    echo "Sub page data for $NAME already exists. Skipping fetch."
    HTML_DATA_SUB=$(cat "$OUTPUT_RAW_SUB_PAGE")
else
    echo "Fetching sub page data for $NAME..."
    HTML_DATA_SUB=$(curl -A "$USER_AGENT" -s "$URL" | html2text -links)
    
    echo "$HTML_DATA_SUB" > "$OUTPUT_RAW_SUB_PAGE"
fi
check_html_for_bad_response "$OUTPUT_RAW_SUB_PAGE"

OUTPUT_RAW_ADVENTURES="$OUTPUT_DIR/raw_adventures_${SAFE_NAME}.json"
if [ -f "$OUTPUT_RAW_ADVENTURES" ]; then
    echo "Adventures JSON for $NAME already exists. Skipping extraction."
    ADVENTURES_JSON=$(cat "$OUTPUT_RAW_ADVENTURES")
else
    echo "Extracting adventures JSON for $NAME..."
    ADVENTURES_JSON=$(fm respond --schema ./schema/adventure_schema.json \
    --model "$FM_MODEL" \
    --instructions "list the cubscout adventures for this rank and their kind (required or elective) and their full urls" \
    --text "$URL => $HTML_DATA_SUB")

    # Save raw adventures JSON for this specific rank
    echo "$ADVENTURES_JSON" > "$OUTPUT_RAW_ADVENTURES"
fi

 # Process adventures JSON
 # object with an Adventures Property that is an array of objects with name, kind, and url properties
 echo "$ADVENTURES_JSON" | jq -r '.Adventures[] | "\(.name)\t\(.kind)\t\(.url)"' | while IFS=$'\t' read -r SUB_NAME SUB_KIND SUB_URL; do
 
 # Sanitize SUB_NAME to create a safe, valid filename
 SAFE_FILENAME=$(echo "$SUB_NAME" | tr -cd 'A-Za-z0-9_-')
 
 
 # Initialize the file with headers using standard file redirection (>)


echo "Processing adventure: $SUB_NAME with URL: $SUB_URL"
 # 4. Third Pass: Fetch final sub-URL and pass as an argument to the third command
OUTPUT_RAW_FINAL_PAGE="$OUTPUT_DIR/raw_final_page_${SAFE_NAME}_${SAFE_FILENAME}.txt"
if [ -f "$OUTPUT_RAW_FINAL_PAGE" ]; then
    echo "Final page data for $SUB_NAME already exists. Skipping fetch."
    HTML_DATA_FINAL=$(cat "$OUTPUT_RAW_FINAL_PAGE")
else
    echo "Fetching final page data for $SUB_NAME..."
    HTML_DATA_FINAL=$(curl -A "$USER_AGENT" -s "$SUB_URL" | html2text)

    echo "$HTML_DATA_FINAL" > "$OUTPUT_RAW_FINAL_PAGE"

    if echo "$HTML_DATA_FINAL" | grep -q "Under Maintenance. Check back soon."; then
        echo "Detected 'Under Maintenance' message for $SUB_NAME. "
        echo "Waiting for 360 seconds before continuing to avoid getting blocked..."
        echo "will start again at $(date -v+360S +"%Y-%m-%d %H:%M:%S")"
        # Make a request to the main page incase the block looks at subequent requests instead of time
        curl -A "$USER_AGENT" -s "$START_URL" > /dev/null 
        sleep 360 # Sleep for 360 seconds before continuing to avoid getting blocked
    fi

fi
check_html_for_bad_response "$OUTPUT_RAW_FINAL_PAGE"

#check html data for "Under Maintenance. Check back soon." 
# skip this adventure if found because that means the adventure does not exist
if echo "$HTML_DATA_FINAL" | grep -q "Under Maintenance. Check back soon."; then
    echo "Skipping $SUB_NAME because it does not exist."
    continue
fi

printf "## %s (%s) [🔗](%s)\n\n" "$SUB_NAME" "$SUB_KIND" "$SUB_URL" >> "$FILE_PATH"

OUTPUT_RAW_REQUIREMENTS="$OUTPUT_DIR/raw_requirements_${SAFE_NAME}_${SAFE_FILENAME}.json"
if [ -f "$OUTPUT_RAW_REQUIREMENTS" ]; then
    echo "Requirements JSON for $SUB_NAME already exists. Skipping Extraction."
    REQUIREMENTS_JSON=$(cat "$OUTPUT_RAW_REQUIREMENTS")
else
    echo "Extracting requirements JSON for $SUB_NAME..."
    REQUIREMENTS_JSON=$(fm respond --schema ./schema/req_schema.json \
    --model "$FM_MODEL" \
    --instructions "list the requirements for this adventure with their number (reqno)./ and text" \
    --text "$HTML_DATA_FINAL")

    # Save raw requirements JSON for this specific adventure
    echo "$REQUIREMENTS_JSON" > "$OUTPUT_RAW_REQUIREMENTS"
fi

 # Process requirements JSON
# object with a Requirements Property that is an array of objects with reqno and text properties
 echo "$REQUIREMENTS_JSON" | jq -c '.Requirements[]' | while read -r row; do
 REQNO=$(echo "$row" | jq -r '.reqNo')
 TEXT=$(echo "$row" | jq -r '.text')
 
 # 5. Append results directly into the specific file (>>)
 printf "%s. %s\n" "$REQNO" "$TEXT" >> "$FILE_PATH"
 done
 printf "\n" >> "$FILE_PATH"
 done
done
