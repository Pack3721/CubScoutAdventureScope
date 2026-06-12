#!/bin/bash

# Configuration
START_URL="https://www.scouting.org/programs/cub-scouts/adventures/"
OUTPUT_DIR="./output"

FM_MODEL="pcc"

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

    HTML_DATA=$(curl -s "$START_URL" | html2text -links)

    echo "$HTML_DATA" > "$OUTPUT_RAW_INITIAL_PAGE"
fi


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
    HTML_DATA_SUB=$(curl -s "$URL" | html2text -links)
    
    echo "$HTML_DATA_SUB" > "$OUTPUT_RAW_SUB_PAGE"
fi

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

 printf "## %s (%s) [🔗](%s)\n\n" "$SUB_NAME" "$SUB_KIND" "$SUB_URL" >> "$FILE_PATH"

echo "Processing adventure: $SUB_NAME with URL: $SUB_URL"
 # 4. Third Pass: Fetch final sub-URL and pass as an argument to the third command
OUTPUT_RAW_FINAL_PAGE="$OUTPUT_DIR/raw_final_page_${SAFE_NAME}_${SAFE_FILENAME}.txt"
if [ -f "$OUTPUT_RAW_FINAL_PAGE" ]; then
    echo "Final page data for $SUB_NAME already exists. Skipping fetch."
    HTML_DATA_FINAL=$(cat "$OUTPUT_RAW_FINAL_PAGE")
else
    echo "Fetching final page data for $SUB_NAME..."
    HTML_DATA_FINAL=$(curl -s "$SUB_URL" | html2text)

    echo "$HTML_DATA_FINAL" > "$OUTPUT_RAW_FINAL_PAGE"
fi
 
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
