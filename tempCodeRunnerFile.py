
                
        except Exception as e:
            print(f"\n[STREAM ERROR] Failed to fetch stream for {video_id}: {e}\n")
            return jsonify({'error': f"Failed to extract stream: {str(e)}"}), 500